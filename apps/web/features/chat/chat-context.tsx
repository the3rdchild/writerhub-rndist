'use client'

import { generateJSON } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { ProviderErrorCode, TemplateSpec } from '@writer-hub/shared'
import {
	CHAT_CONTEXT_LIMITS,
	type ChatMessage,
	type ChatStreamPhase,
	type ChatUsage,
	DEFAULT_CHAT_MODEL,
	isReadTool,
	type ToolCall,
} from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { useEditorInstance } from '@/features/editor/editor-context'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { toEditorContent } from '@/features/editor/markdown'
import { lineToJSON } from '@/features/editor/page-furniture/furniture-schema'
import type {
	FurnitureSlot,
	FurnitureVariant,
	PageFurnitureLine,
} from '@/features/editor/page-furniture/model'
import {
	readPageFurniture,
	removeFurnitureFragments,
	setFurnitureFragment,
	setFurnitureVariantEnabled,
	setPageFurnitureForTab,
} from '@/features/editor/page-furniture/page-furniture-ydoc'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import { paginationKey } from '@/features/editor/pagination'
import { editorPlainText } from '@/features/editor/text-content'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { createTab as createTabInDoc } from '@/features/sessions/ydoc'
import { buildSchema, fragmentToJSON, jsonToFragment } from '@/features/sync/serialize'
import { useSync } from '@/features/sync/sync-context'
import { getTemplate } from '@/features/templates/api'
import { useActiveDocumentMetadata, useActiveTemplate } from '@/features/templates/use-templates'
import { createVersion } from '@/features/versions/api'
import { snapshotLocalVersion } from '@/features/versions/local-snapshot'
import { useInvalidateVersions } from '@/features/versions/use-versions'
import { usePersistentState } from '@/lib/use-persistent-state'
import { parseFallbackCalls, streamChat, stripFallbackCalls } from './api'
import { chatFailureHint, toChatTurnError } from './failure'
import { isRemoteReadTool, remoteToolLabel, runRemoteReadTool } from './remote-tools'
import {
	applyWriteTool,
	pageSummary,
	type ReadToolContext,
	readToolLabel,
	runReadTool,
	summarizeToolResult,
	type ToolOutcome,
} from './tools'
import {
	appendStep,
	appendText as appendTextTo,
	type ChatStep,
	closeAll,
	closeRunning,
	flatSteps,
	lastRunningStep,
	mapSteps,
	patchStep,
	type TurnPart,
	visibleParts,
} from './turn-parts'
import { formatWordDelta, sumWordDeltas, type WordDelta, wordDelta } from './word-delta'

export type { ChatStep, TurnPart } from './turn-parts'
export { flatSteps } from './turn-parts'

export interface ChatAttachment {
	text: string
	surrounding: string
	offset: number
	length: number
}

export interface ChatTurn extends ChatMessage {
	actions?: ToolCall[]
	taskId?: string
	/**
	 * Bagian giliran ini sesuai urutan datangnya. `content` tetap ada dan tetap
	 * memuat seluruh teksnya - ia yang dikirim ke provider; `parts` hanya
	 * mengatur bagaimana giliran itu digambar.
	 */
	parts?: TurnPart[]
	usage?: ChatUsage
	intermediate?: boolean
}

const MAX_TOOL_ROUNDS = 12
const MAX_READ_CALLS = 48

const BUDGET_NOTICE =
	'\n\n[System] Read budget for this turn is exhausted. Answer now with what you already have, or propose write tools. Further read tools will not be executed.'

const MAX_WRITE_WAVES = 8

const WRITE_WAVE_NOTICE =
	'\n\n[System] This is the last batch of edits that will be carried out automatically for this request. Wrap up: summarize what changed and what is left for the writer to decide.'

const PHASE_LABEL: Record<ChatStreamPhase, string> = {
	connecting: 'Menghubungi provider…',
	thinking: 'Berpikir…',
	reading: 'Menyiapkan pembacaan dokumen…',
	writing: 'Menyusun jawaban…',
	retrying: 'Mencoba ulang tanpa tool calling…',
}

function newTaskId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ?? `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
	)
}

export function buildOutboundMessages(history: ChatTurn[], currentTaskId: string | undefined): ChatMessage[] {
	const outbound: ChatMessage[] = []
	for (const turn of history) {
		if (turn.taskId === currentTaskId) {
			const {
				actions: _actions,
				taskId: _taskId,
				parts: _parts,
				usage: _usage,
				intermediate: _intermediate,
				...message
			} = turn
			outbound.push(message)
			continue
		}
		if (turn.role === 'tool') continue
		if (turn.role === 'assistant') {
			if (turn.content) outbound.push({ role: 'assistant', content: turn.content })
			continue
		}
		outbound.push({ role: turn.role, content: turn.content })
	}
	if (outbound.length > CHAT_CONTEXT_LIMITS.messages) {
		let start = outbound.length - CHAT_CONTEXT_LIMITS.messages
		while (start < outbound.length - 1 && outbound[start].role !== 'user') start++
		return outbound.slice(start)
	}
	return outbound
}

export function actionsSettled(history: ChatTurn[], owner: ChatTurn): boolean {
	const decided = new Set(history.filter((turn) => turn.role === 'tool').map((turn) => turn.toolCallId))
	return (owner.actions ?? []).every((action) => decided.has(action.id))
}

const OUTLINE_SNIPPET_CHARS = 600

function editorOutlineSummary(editor: Editor): string | undefined {
	const doc = editor.state.doc
	const lines: string[] = []
	let headingCount = 0
	doc.descendants((node) => {
		if (node.type.name === 'heading') {
			headingCount += 1
			lines.push(`${'#'.repeat((node.attrs.level as number) ?? 1)} ${node.textContent.trim()}`)
			return false
		}
		return true
	})

	const plain = editorPlainText(editor)
	const hasText = plain.trim().length > 0
	if (!hasText && headingCount === 0) return undefined

	const parts: string[] = []
	if (headingCount > 0) parts.push(`Outline (${headingCount} heading):\n${lines.join('\n')}`)
	parts.push(`Opening:\n${plain.slice(0, OUTLINE_SNIPPET_CHARS).trim()}`)
	return parts.join('\n\n')
}

/**
 * Kegagalan giliran yang sedang ditampilkan. Ia membawa sebabnya, bukan hanya
 * kalimatnya, supaya panel bisa memutuskan apakah pantas menawarkan
 * "Lanjutkan" - dan supaya kalimat seperti "The operation timed out." tidak
 * pernah lagi sampai ke penulis.
 */
export interface ChatError {
	message: string
	code: ProviderErrorCode
	hint: string | null
	/** Sudah dicoba ulang sekali sendiri sebelum ditampilkan. */
	autoRetried: boolean
}

interface ChatContextValue {
	messages: ChatTurn[]
	streaming: string | null
	parts: TurnPart[]
	isRunning: boolean
	error: ChatError | null
	/** Melanjutkan giliran terakhir dari langkah yang sudah tersimpan. */
	retry: () => void

	attachment: ChatAttachment | null
	attach: (attachment: ChatAttachment) => void
	clearAttachment: () => void
	includeDocument: boolean
	setIncludeDocument: (value: boolean) => void

	send: (prompt: string) => void
	stop: () => void
	reset: () => void
	startNewTopic: () => void
	currentTaskId: string | undefined
	applyAction: (call: ToolCall) => ToolOutcome
	applyActions: (calls: ToolCall[]) => void
	/** Besaran perubahan satu aksi, kalau ia memang menyentuh naskah. */
	actionWords: (id: string) => WordDelta | undefined
	skipAction: (call: ToolCall) => void
	isActionApplied: (id: string) => boolean
	isActionSettled: (id: string) => boolean
	autoApply: boolean
	setAutoApply: (value: boolean) => void
	research: boolean
	setResearch: (value: boolean) => void
	model: string
	setModel: (value: string) => void
}

/** Jeda sebelum percobaan ulang otomatis - cukup untuk gangguan sekejap lewat. */
const AUTO_RETRY_DELAY_MS = 1_500

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
	const { state } = useDocument()
	const { editor } = useEditorInstance()
	const { setActivePanel, markRun } = usePanels()
	const { doc, activeDocId, activeId, sessions, comments, addComment, renameDocument, renameSession } =
		useSessions()
	const { setup, setPageSetup } = usePageSetup()
	const { furniture } = usePageFurniture()
	const language = useDocumentLanguage()
	const [messages, setMessages] = useState<ChatTurn[]>([])
	const [streaming, setStreaming] = useState<string | null>(null)
	const [error, setError] = useState<ChatError | null>(null)
	const [attachment, setAttachment] = useState<ChatAttachment | null>(null)
	const [includeDocument, setIncludeDocument] = useState(false)
	const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(undefined)
	const currentTaskIdRef = useRef<string | undefined>(undefined)
	currentTaskIdRef.current = currentTaskId
	const [appliedActionIds, setAppliedActionIds] = useState<Set<string>>(() => new Set())
	const [autoApply, setAutoApply] = usePersistentState('writer-hub-chat-auto-apply', false)
	const autoApplyRef = useRef(autoApply)
	autoApplyRef.current = autoApply
	const [research, setResearch] = usePersistentState('writer-hub-chat-research', false)
	const researchRef = useRef(research)
	researchRef.current = research
	/*
	 * Tab aktif di sisi server, kalau memang ada padanannya.
	 *
	 * Dua pemakai: riset dicatat ke Aktivitas dan butuh tautan supaya entrinya
	 * tidak yatim di halaman itu, dan snapshot `ai_result` (§T4) butuh tahu
	 * apakah versinya ditulis ke server atau ke simpanan lokal.
	 */
	const { linkage } = useSync()
	const serverTabRef = useRef<string | null>(null)
	serverTabRef.current = activeId ? (linkage[activeId]?.serverId ?? null) : null
	// Template asal dokumen aktif: slug-nya ikut ke prompt server, spec-nya
	// menjawab alat baca get_template_rules.
	const activeTemplate = useActiveTemplate()
	const templateRef = useRef(activeTemplate)
	templateRef.current = activeTemplate
	/* Berjalan bersama slug templatenya: aturan format dan penjelasan dokumen
	 * dikirim dalam satu permintaan yang sama. */
	const activeMetadata = useActiveDocumentMetadata()
	const metadataRef = useRef(activeMetadata)
	metadataRef.current = activeMetadata
	const applyActionsRef = useRef<((calls: ToolCall[]) => void) | null>(null)
	const pendingAutoApplyRef = useRef<ToolCall[] | null>(null)
	const messagesRef = useRef<ChatTurn[]>(messages)
	const writeWavesRef = useRef<{ taskId: string | undefined; count: number }>({
		taskId: undefined,
		count: 0,
	})
	const [parts, setParts] = useState<TurnPart[]>([])
	const partsRef = useRef<TurnPart[]>([])

	const abortRef = useRef<AbortController | null>(null)
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	/** Ada percobaan ulang otomatis yang sedang menunggu gilirannya. */
	const retryPendingRef = useRef(false)
	const startTurnRef = useRef<((history: ChatTurn[], taskId: string, autoRetried?: boolean) => void) | null>(
		null,
	)
	const editorRef = useRef(editor)
	editorRef.current = editor
	const toolsRef = useRef(true)
	const [model, setModel] = usePersistentState('writer-hub-chat-model', DEFAULT_CHAT_MODEL)
	const modelRef = useRef(model)
	modelRef.current = model

	const contextRef = useRef({ attachment, includeDocument, state })
	contextRef.current = { attachment, includeDocument, state }
	const { setTypography } = useTypography()
	const appRef = useRef({
		setup,
		setPageSetup,
		setTypography,
		furniture,
		doc,
		activeDocId,
		activeId,
		sessions,
		comments,
		renameDocument,
		renameSession,
	})
	appRef.current = {
		setup,
		setPageSetup,
		setTypography,
		furniture,
		doc,
		activeDocId,
		activeId,
		sessions,
		comments,
		renameDocument,
		renameSession,
	}

	/*
	 * Spec template yang sudah diambil, menurut slug.
	 *
	 * Diisi di `runTurn` - yang asinkron - begitu model memanggil
	 * `apply_template_format`, lalu dibaca sinkron saat usulannya diterapkan.
	 * Katalog tidak pernah diunduh utuh: hanya template yang benar-benar
	 * diminta, sekali per sesi.
	 */
	const templateSpecsRef = useRef(new Map<string, TemplateSpec>())

	/**
	 * Mengambil spec untuk tiap `apply_template_format` yang slug-nya belum
	 * pernah diambil. Kegagalan sengaja didiamkan di sini: alat tulisnya yang
	 * melaporkan "template tidak dikenal" ke model, lengkap dengan slug yang
	 * salah - sehingga model bisa memperbaiki pilihannya sendiri.
	 */
	const loadTemplateSpecs = useCallback(async (calls: ToolCall[]) => {
		const pending = new Set(
			calls
				.filter((call) => call.name === 'apply_template_format')
				.map((call) => String(call.arguments.template ?? '').trim())
				.filter((slug) => slug !== '' && !templateSpecsRef.current.has(slug)),
		)

		await Promise.all(
			[...pending].map(async (slug) => {
				try {
					templateSpecsRef.current.set(slug, (await getTemplate(slug)).spec)
				} catch {}
			}),
		)
	}, [])
	const commit = useCallback((next: ChatTurn[]) => {
		messagesRef.current = next
		setMessages(next)
	}, [])
	const buildContext = useCallback(() => {
		const { attachment: current, includeDocument: whole, state: document } = contextRef.current
		const editor = editorRef.current
		let documentText: string | undefined
		if (editor && !editor.isDestroyed) {
			documentText = whole
				? editorPlainText(editor).slice(0, CHAT_CONTEXT_LIMITS.document)
				: editorOutlineSummary(editor)
		} else {
			const text = whole
				? document.text?.slice(0, CHAT_CONTEXT_LIMITS.document)
				: document.text?.slice(0, OUTLINE_SNIPPET_CHARS)
			documentText = text || undefined
		}

		return {
			title: document.title || undefined,
			selection: current?.text,
			surrounding: current?.surrounding,
			document: documentText,
			page: pageSummary(appRef.current.setup),
		}
	}, [])

	const stop = useCallback(() => {
		// Percobaan ulang yang masih menunggu ikut dibatalkan; tanpa ini
		// percakapan yang sudah dihentikan penulis hidup lagi sedetik kemudian.
		if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
		retryTimerRef.current = null
		retryPendingRef.current = false
		abortRef.current?.abort()
		abortRef.current = null
		setStreaming(null)
	}, [])

	const setPartsBoth = (next: TurnPart[]) => {
		partsRef.current = next
		setParts(next)
	}

	/**
	 * Langkah berurutan: yang baru menutup yang sebelumnya, karena model memang
	 * mengerjakannya satu per satu. Pekerjaan sub-agent memakai `startBackgroundStep`.
	 */
	const pushStep = (label: string, detail?: string): string => {
		const now = Date.now()
		const closed = closeRunning('done', partsRef.current, now)
		const id = `step_${now.toString(36)}_${flatSteps(closed).length}`
		setPartsBoth(appendStep(closed, { id, label, status: 'running', startedAt: now, detail }))
		return id
	}

	const appendText = (delta: string) => {
		setPartsBoth(appendTextTo(partsRef.current, delta))
	}

	const patchRunningStep = (patch: Partial<ChatStep>) => {
		const last = lastRunningStep(partsRef.current)
		if (!last) return
		setPartsBoth(patchStep(partsRef.current, last.id, patch))
	}

	/**
	 * Giliran benar-benar berakhir, jadi yang berjalan sendiri pun ditutup: satu
	 * gambar yang belum kembali saat gilirannya disimpan tidak akan pernah
	 * kembali, dan spinner yang berputar selamanya lebih buruk daripada langkah
	 * yang ditandai selesai.
	 */
	const finishParts = (): TurnPart[] | undefined => {
		const closed = closeAll('done', partsRef.current)
		setPartsBoth(closed)
		return closed.length > 0 ? closed : undefined
	}
	const planRef = useRef<{ stepId: string; next: number } | null>(null)

	const recordPlan = (items: string[]) => {
		const stepId = pushStep(`Rencana ${items.length} langkah`)
		setPartsBoth(
			mapSteps(partsRef.current, (step) =>
				step.id === stepId
					? {
							...step,
							status: 'done',
							endedAt: Date.now(),
							checklist: items.map((text) => ({ text, done: false })),
						}
					: step,
			),
		)
		planRef.current = { stepId, next: 0 }
	}

	const advancePlan = () => {
		const plan = planRef.current
		if (!plan) return
		setPartsBoth(
			mapSteps(partsRef.current, (step) =>
				step.id === plan.stepId && step.checklist
					? {
							...step,
							checklist: step.checklist.map((item, index) =>
								index === plan.next ? { ...item, done: true } : item,
							),
						}
					: step,
			),
		)
		plan.next += 1
	}
	const buildReadContext = (editor: Editor): ReadToolContext => {
		const app = appRef.current
		const template = templateRef.current
		return {
			editor,
			pageCount: paginationKey.getState(editor.state)?.pageCount ?? 1,
			setup: app.setup,
			tabs: app.sessions.map((tab) => ({
				id: tab.id,
				label: sessionLabel(tab),
				active: tab.id === app.activeId,
			})),
			readTab: (tabId) => {
				try {
					const json = fragmentToJSON(app.doc, tabId)
					const node = buildSchema().nodeFromJSON(json)
					return node.textBetween(0, node.content.size, '\n', ' ')
				} catch {
					return null
				}
			},
			comments: app.comments,
			template: template ? { name: template.name, slug: template.slug, spec: template.spec } : null,
			furniture: app.furniture,
		}
	}
	const createTabWithContent = (title: string | undefined, markdown: string | undefined) => {
		const app = appRef.current
		if (!app.activeDocId) return
		const id = createTabInDoc(app.doc, app.activeDocId, title ?? 'Untitled document')
		if (markdown?.trim()) {
			const json = generateJSON(toEditorContent(markdown), buildEditorExtensions())
			jsonToFragment(app.doc, id, json)
		}
	}

	const renameActiveDocument = (title: string): ToolOutcome => {
		const app = appRef.current
		if (!app.activeDocId) return { ok: false, message: 'No document is open.' }
		app.renameDocument(app.activeDocId, title)
		return { ok: true, message: `Document renamed to "${title}".` }
	}

	/*
	 * Tab yang tidak disebutkan berarti tab yang sedang dibuka. Id yang disebut
	 * dicocokkan dulu ke daftar tab dokumen ini - `updateTab` diam saja untuk id
	 * yang tidak ada, dan model perlu tahu kalau tebakannya meleset.
	 */
	const renameTabById = (tabId: string | undefined, title: string): ToolOutcome => {
		const app = appRef.current
		const target = tabId ?? app.activeId
		if (!target) return { ok: false, message: 'No tab is open.' }
		const tab = app.sessions.find((session) => session.id === target)
		if (!tab) return { ok: false, message: `No tab with id ${target}. Call list_tabs first.` }
		app.renameSession(target, title)
		return { ok: true, message: `Tab renamed to "${title}".` }
	}
	/*
	 * Header/footer hidup di meta ydoc tab, bukan di dokumen editor - jadi
	 * penulisannya lewat konteks alat, bukan lewat `editor`. Fragmen kaya
	 * ditulis SEKALIGUS dengan baris lawasnya, persis seperti penyunting
	 * perabot: fragmen yang menang di layar, baris yang dibaca ekspor lawas
	 * dan sinkronisasi API.
	 */
	const setFurnitureLine = (
		slot: FurnitureSlot,
		variant: FurnitureVariant,
		line: PageFurnitureLine | null,
	): ToolOutcome => {
		const app = appRef.current
		const tabId = app.activeId
		if (!tabId) return { ok: false, message: 'No tab is open.' }

		if (line) {
			setFurnitureFragment(app.doc, tabId, { slot, variant }, { type: 'doc', content: [lineToJSON(line)] })
		} else {
			removeFurnitureFragments(app.doc, tabId, [{ slot, variant }])
		}

		const raw = readPageFurniture(app.doc, tabId)
		const slotLines = { ...(raw?.[slot] ?? {}) }
		if (line) slotLines[variant] = line
		else delete slotLines[variant]
		setPageFurnitureForTab(app.doc, tabId, { ...(raw ?? {}), [slot]: slotLines })

		const where = variant === 'first' ? ' for the first page' : variant === 'even' ? ' for even pages' : ''
		return line
			? { ok: true, message: `${slot === 'header' ? 'Header' : 'Footer'} set${where}.` }
			: { ok: true, message: `${slot === 'header' ? 'Header' : 'Footer'} cleared${where}.` }
	}

	const setFirstPageSeparate = (separate: boolean): ToolOutcome => {
		const app = appRef.current
		const tabId = app.activeId
		if (!tabId) return { ok: false, message: 'No tab is open.' }
		setFurnitureVariantEnabled(app.doc, tabId, 'first', separate, app.furniture)
		return { ok: true, message: 'First page updated.' }
	}

	const runTurn = useCallback(
		async (
			history: ChatTurn[],
			round: number,
			controller: AbortController,
			taskId: string,
			readsUsed = 0,
			sealed = false,
		): Promise<void> => {
			let answer = ''
			const calls: ToolCall[] = []
			let usage: ChatUsage | undefined
			let reasoning = ''

			try {
				await streamChat(
					{
						messages: buildOutboundMessages(history, taskId),
						context: buildContext(),
						tools: toolsRef.current,
						research: researchRef.current,
						model: modelRef.current,
						templateSlug: templateRef.current?.slug,
						metadata: metadataRef.current ?? undefined,
					},
					{
						onDelta: (delta) => {
							answer += delta
							setStreaming(answer)
							appendText(delta)
						},
						onToolCall: (call) => calls.push(call),
						onToolsUnsupported: () => {
							toolsRef.current = false
						},
						onStatus: (phase, detail) => pushStep(PHASE_LABEL[phase], detail),
						onReasoning: (text) => {
							reasoning += text
							patchRunningStep({ detail: reasoning })
						},
						onUsage: (report) => {
							usage = report
						},
					},
					controller.signal,
				)
			} catch (cause) {
				if (controller.signal.aborted) {
					const cancelled = closeAll('cancelled', partsRef.current)
					setPartsBoth(cancelled)
					const partial = stripFallbackCalls(answer)
					if (partial || cancelled.length > 0) {
						commit([
							...history,
							{
								role: 'assistant',
								content: partial,
								taskId,
								parts: cancelled.length > 0 ? visibleParts(cancelled) : undefined,
								usage,
							},
						])
					}
				} else {
					setPartsBoth(closeAll('failed', partsRef.current))
				}
				throw cause
			}
			calls.push(...parseFallbackCalls(answer))

			const visible = stripFallbackCalls(answer)
			const reads = calls.filter((call) => isReadTool(call.name))
			const writes = calls.filter((call) => !isReadTool(call.name))

			// Spec template diambil di sini, selagi masih boleh menunggu.
			await loadTemplateSpecs(writes)

			const assistant: ChatTurn = {
				role: 'assistant',
				content: visible,
				taskId,
				toolCalls:
					calls.length > 0
						? calls.map((call) => ({
								id: call.id,
								name: call.name,
								arguments: JSON.stringify(call.arguments),
							}))
						: undefined,
				actions: writes.length > 0 ? writes : undefined,
			}

			const editor = editorRef.current
			const budgetSpent = round >= MAX_TOOL_ROUNDS || readsUsed >= MAX_READ_CALLS
			if (reads.length === 0 || sealed) {
				if (reads.length > 0 && sealed) {
					pushStep('Penelusuran ditutup')
					patchRunningStep({
						status: 'done',
						endedAt: Date.now(),
						detail: 'Model masih meminta bacaan setelah anggaran habis; permintaannya tidak dijalankan.',
					})
				}
				const finalTurn: ChatTurn = { ...assistant, parts: visibleParts(finishParts()), usage }
				commit([...history, finalTurn])
				if (writes.length > 0 && autoApplyRef.current) pendingAutoApplyRef.current = writes
				return
			}
			const results: ChatTurn[] = []
			const readContext = editor ? buildReadContext(editor) : null
			for (const call of reads) {
				if (call.name === 'plan') {
					const items = Array.isArray(call.arguments.steps)
						? call.arguments.steps.map(String).filter(Boolean)
						: []
					if (items.length > 0) recordPlan(items)
					results.push({
						role: 'tool',
						content: 'Plan recorded and shown to the user.',
						toolCallId: call.id,
						taskId,
					})
					continue
				}
				if (call.name === 'think') {
					pushStep('Berpikir sejenak')
					patchRunningStep({
						status: 'done',
						endedAt: Date.now(),
						detail: String(call.arguments.thought ?? ''),
					})
					results.push({ role: 'tool', content: 'OK.', toolCallId: call.id, taskId })
					continue
				}

				if (isRemoteReadTool(call.name)) {
					pushStep(remoteToolLabel(call))
					const remote = await runRemoteReadTool(call, controller.signal, serverTabRef.current)
					patchRunningStep({
						status: 'done',
						endedAt: Date.now(),
						detail: `${JSON.stringify(call.arguments)}\n→ ${summarizeToolResult(remote.text)}`,
						sources: remote.sources,
					})
					advancePlan()
					results.push({ role: 'tool', content: remote.text, toolCallId: call.id, taskId })
					continue
				}

				if (!editor || !readContext) {
					results.push({
						role: 'tool',
						content: 'Editor sedang tidak tersedia, jadi alat baca dokumen tidak bisa dijalankan.',
						toolCallId: call.id,
						taskId,
					})
					continue
				}

				pushStep(readToolLabel(editor, call))
				const content = runReadTool(readContext, call)
				patchRunningStep({
					status: 'done',
					endedAt: Date.now(),
					detail: `${JSON.stringify(call.arguments)}\n→ ${summarizeToolResult(content)}`,
				})
				advancePlan()
				results.push({ role: 'tool', content, toolCallId: call.id, taskId })
			}
			if (budgetSpent && results.length > 0) {
				const last = results[results.length - 1]
				results[results.length - 1] = { ...last, content: last.content + BUDGET_NOTICE }
				pushStep('Anggaran penelusuran habis')
				patchRunningStep({
					status: 'done',
					endedAt: Date.now(),
					detail: `${round} putaran · ${readsUsed + reads.length} alat baca. Model diminta menjawab dengan bahan yang ada.`,
				})
			}
			/*
			 * Langkah putaran ini ikut ke giliran putaran ini, bukan menumpuk ke
			 * satu daftar milik giliran terakhir. Justru inilah yang membuat
			 * urutannya benar: `messages` sudah terurut, jadi begitu tiap putaran
			 * membawa langkahnya sendiri, teks dan kerja terbaca bergantian.
			 */
			const roundParts = visibleParts(finishParts())
			const step: ChatTurn = {
				...assistant,
				parts: roundParts,
				intermediate: !visible && writes.length === 0 && roundParts === undefined,
			}
			commit([...history, step, ...results])
			setPartsBoth([])
			setStreaming('')
			await runTurn(
				[...history, step, ...results],
				round + 1,
				controller,
				taskId,
				readsUsed + reads.length,
				budgetSpent,
			)
		},
		[loadTemplateSpecs],
	)
	/*
	 * Satu giliran, dengan satu kesempatan mengulang diam-diam.
	 *
	 * Yang diulang adalah `messagesRef.current`, bukan `history` yang dikirim
	 * ke sini: hasil alat yang sudah selesai sudah ter-commit ke sana sebelum
	 * rekursi (lihat `commit([...history, step, ...results])` di atas), jadi
	 * percobaan ulang melanjutkan dari langkah terakhir yang berhasil dan tidak
	 * mengulang pencarian web yang tadi sudah memakan waktu.
	 */
	const startTurn = useCallback(
		(history: ChatTurn[], taskId: string, autoRetried = false) => {
			const controller = new AbortController()
			abortRef.current = controller

			runTurn(history, 0, controller, taskId)
				.catch((cause: unknown) => {
					if (controller.signal.aborted) return
					const failure = toChatTurnError(cause)

					if (failure.retryable && !autoRetried) {
						// Panel tetap terbaca "sedang berjalan" selama jeda ini; tanpa
						// penanda ini `finally` di bawah mengosongkannya dulu, dan
						// percakapan tampak berhenti sedetik lalu hidup lagi sendiri.
						retryPendingRef.current = true
						retryTimerRef.current = setTimeout(() => {
							retryPendingRef.current = false
							startTurnRef.current?.(messagesRef.current, taskId, true)
						}, AUTO_RETRY_DELAY_MS)
						return
					}

					setError({
						message: failure.message,
						code: failure.code,
						hint: chatFailureHint(failure.code),
						autoRetried,
					})
				})
				.finally(() => {
					abortRef.current = null
					if (!retryPendingRef.current) setStreaming(null)
					const pending = pendingAutoApplyRef.current
					pendingAutoApplyRef.current = null
					if (pending && !controller.signal.aborted) applyActionsRef.current?.(pending)
				})
		},
		[runTurn],
	)
	startTurnRef.current = startTurn

	/**
	 * Melanjutkan giliran terakhir tanpa kehilangan percakapannya. Ia memakai
	 * `taskId` yang sama supaya langkah dan usulan hasil percobaan ini tetap
	 * terhitung sebagai tugas yang sama.
	 */
	const retry = useCallback(() => {
		if (abortRef.current || messagesRef.current.length === 0) return

		setError(null)
		setStreaming('')
		startTurnRef.current?.(messagesRef.current, currentTaskIdRef.current ?? newTaskId(), false)
	}, [])

	const send = useCallback(
		(prompt: string) => {
			const trimmed = prompt.trim()
			if (!trimmed || abortRef.current) return
			const taskId = newTaskId()
			const history: ChatTurn[] = [...messagesRef.current, { role: 'user', content: trimmed, taskId }]
			commit(history)
			setCurrentTaskId(taskId)
			setStreaming('')
			setError(null)
			setPartsBoth([])
			planRef.current = null
			writeWavesRef.current = { taskId, count: 0 }

			startTurn(history, taskId)
		},
		[commit, startTurn],
	)
	/*
	 * Besaran tiap aksi, dipegang dua kali karena dua pembacanya berbeda umur:
	 * kartu aksi merender dari state, sedangkan `settleActions` menjumlahkannya
	 * di dalam callback yang ter-memo dan butuh nilai terkini.
	 */
	const [actionWords, setActionWords] = useState<Record<string, WordDelta>>({})
	const actionWordsRef = useRef<Record<string, WordDelta>>({})
	const invalidateVersions = useInvalidateVersions()

	/**
	 * Satu versi bertanda AI per giliran chat, bukan per aksi.
	 *
	 * Penulis yang menerapkan lima suntingan dari satu jawaban tidak sedang
	 * membuat lima titik pemulihan; ia membuat satu. Karena itu snapshot diambil
	 * ketika seluruh aksi giliran itu sudah selesai diputuskan - diterapkan atau
	 * dilewati - dengan angka gabungannya.
	 *
	 * Konsekuensi yang disengaja: giliran yang aksinya dibiarkan menggantung
	 * tidak pernah mendapat versi bertanda AI. Isinya tetap tersimpan lewat
	 * snapshot interval; yang hilang cuma keterangannya, dan itu lebih baik
	 * daripada menandai naskah yang penulis sendiri belum putuskan.
	 */
	const snapshotAiResult = useCallback(
		async (delta: WordDelta) => {
			const summary = formatWordDelta(delta)
			const label = summary ? `AI Chat · ${summary}` : 'AI Chat'
			const serverTabId = serverTabRef.current

			if (serverTabId) {
				await createVersion(serverTabId, label, 'ai_result').catch(() => undefined)
				invalidateVersions({ tabId: serverTabId, serverTabId })
				return
			}

			const tabId = appRef.current.activeId
			if (!tabId) return
			await snapshotLocalVersion(appRef.current.doc, tabId, 'ai_result', label)
			invalidateVersions({ tabId, serverTabId: null })
		},
		[invalidateVersions],
	)

	const runWriteTool = useCallback(
		(call: ToolCall): ToolOutcome => {
			if (appliedActionIds.has(call.id)) return { ok: true, message: 'Sudah diterapkan.' }

			const editor = editorRef.current
			if (!editor) return { ok: false, message: 'Editor belum siap.' }

			// Diukur mengapit penerapannya, bukan dari argumen alat: yang dihitung
			// harus perubahan yang benar-benar mendarat di naskah.
			const before = editorPlainText(editor)

			const outcome = applyWriteTool(
				{
					editor,
					addComment,
					openPanel: setActivePanel,
					runModule: (feature) =>
						markRun(feature, { text: state.text, offset: 0, scoped: false, language: language.code }),
					setup: appRef.current.setup,
					setPageSetup: appRef.current.setPageSetup,
					setTypography: appRef.current.setTypography,
					templateSpecs: templateSpecsRef.current,
					createTab: createTabWithContent,
					renameDocument: renameActiveDocument,
					renameTab: renameTabById,
					setFurnitureLine,
					setFirstPageSeparate,
				},
				call,
			)

			if (outcome.ok) {
				setAppliedActionIds((current) => new Set(current).add(call.id))
				const delta = wordDelta(before, editorPlainText(editor))
				if (delta.added > 0 || delta.removed > 0) {
					actionWordsRef.current = { ...actionWordsRef.current, [call.id]: delta }
					setActionWords(actionWordsRef.current)
				}
			}
			return outcome
		},
		[appliedActionIds, addComment, setActivePanel, markRun, state.text, language.code],
	)
	const settleActions = useCallback(
		(entries: { call: ToolCall; content: string }[]) => {
			const current = messagesRef.current
			const settled = new Set(current.filter((turn) => turn.role === 'tool').map((turn) => turn.toolCallId))
			const fresh = entries.filter((entry) => !settled.has(entry.call.id))
			if (fresh.length === 0) return
			const owner = current.find(
				(turn) => turn.role === 'assistant' && turn.actions?.some((action) => action.id === fresh[0].call.id),
			)
			const taskId = owner?.taskId

			const results: ChatTurn[] = fresh.map((entry) => ({
				role: 'tool' as const,
				content: entry.content,
				toolCallId: entry.call.id,
				taskId,
			}))
			const complete =
				owner !== undefined && taskId !== undefined && actionsSettled([...current, ...results], owner)

			// Seluruh aksi giliran ini sudah diputuskan: saatnya satu versi bertanda AI.
			if (complete && owner?.actions) {
				const deltas = owner.actions
					.map((action) => actionWordsRef.current[action.id])
					.filter((delta): delta is WordDelta => delta !== undefined)
				if (deltas.length > 0) void snapshotAiResult(sumWordDeltas(deltas))
			}
			const waves = writeWavesRef.current
			const count = waves.taskId === taskId ? waves.count + 1 : 1
			const resumable = complete && taskId === currentTaskId && !abortRef.current && count <= MAX_WRITE_WAVES
			if (resumable && count === MAX_WRITE_WAVES) {
				const last = results[results.length - 1]
				results[results.length - 1] = { ...last, content: last.content + WRITE_WAVE_NOTICE }
			}

			const next = [...current, ...results]
			commit(next)

			if (!resumable || taskId === undefined) return
			writeWavesRef.current = { taskId, count }

			setStreaming('')
			setPartsBoth([])
			startTurn(next, taskId)
		},
		[commit, currentTaskId, startTurn, snapshotAiResult],
	)

	const applyAction = useCallback(
		(call: ToolCall): ToolOutcome => {
			const outcome = runWriteTool(call)
			settleActions([{ call, content: outcome.message }])
			return outcome
		},
		[runWriteTool, settleActions],
	)
	const applyActions = useCallback(
		(calls: ToolCall[]) => {
			settleActions(calls.map((call) => ({ call, content: runWriteTool(call).message })))
		},
		[runWriteTool, settleActions],
	)
	applyActionsRef.current = applyActions

	const skipAction = useCallback(
		(call: ToolCall) => {
			settleActions([
				{ call, content: 'The writer skipped this action. It was not applied to the document.' },
			])
		},
		[settleActions],
	)
	const startNewTopic = useCallback(() => {
		setCurrentTaskId(newTaskId())
	}, [])

	const reset = useCallback(() => {
		stop()
		commit([])
		setStreaming(null)
		setError(null)
		setAttachment(null)
		setAppliedActionIds(new Set())
		setCurrentTaskId(undefined)
		setPartsBoth([])
		writeWavesRef.current = { taskId: undefined, count: 0 }
	}, [stop, commit])
	const settledActionIds = useMemo(
		() =>
			new Set(
				messages
					.filter((turn) => turn.role === 'tool' && turn.toolCallId)
					.map((turn) => turn.toolCallId as string),
			),
		[messages],
	)

	const value = useMemo<ChatContextValue>(
		() => ({
			messages,
			streaming,
			parts,
			isRunning: streaming !== null,
			error,
			retry,
			attachment,
			attach: setAttachment,
			clearAttachment: () => setAttachment(null),
			includeDocument,
			setIncludeDocument,
			send,
			stop,
			reset,
			startNewTopic,
			currentTaskId,
			applyAction,
			applyActions,
			actionWords: (id: string) => actionWords[id],
			skipAction,
			isActionApplied: (id: string) => appliedActionIds.has(id),
			isActionSettled: (id: string) => settledActionIds.has(id),
			autoApply,
			setAutoApply,
			research,
			setResearch,
			model,
			setModel,
		}),
		[
			messages,
			streaming,
			parts,
			error,
			retry,
			attachment,
			includeDocument,
			send,
			stop,
			reset,
			startNewTopic,
			currentTaskId,
			applyAction,
			applyActions,
			actionWords,
			skipAction,
			appliedActionIds,
			settledActionIds,
			autoApply,
			setAutoApply,
			research,
			setResearch,
			model,
			setModel,
		],
	)

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
	const context = useContext(ChatContext)
	if (!context) throw new Error('useChat harus dipakai di dalam <ChatProvider>')
	return context
}

export function extractProposals(content: string): string[] {
	const proposals: string[] = []
	const fence = /```[\w-]*\n([\s\S]*?)```/g

	let match = fence.exec(content)
	while (match !== null) {
		const text = match[1].trim()
		if (text) proposals.push(text)
		match = fence.exec(content)
	}
	for (const table of extractTables(stripFences(content))) proposals.push(table)

	return proposals
}

const FENCE_PATTERN = /```[\w-]*\n[\s\S]*?```/g
const TABLE_PATTERN = /(?:^\|.*\|[ \t]*\n)(?:^\|[\s:|-]*-[\s:|-]*\|[ \t]*\n)(?:^\|.*\|[ \t]*\n?)*/gm

function stripFences(content: string): string {
	return content.replace(FENCE_PATTERN, '')
}

function extractTables(content: string): string[] {
	return (content.match(TABLE_PATTERN) ?? []).map((table) => table.trim()).filter(Boolean)
}

export function stripProposals(content: string): string {
	return stripFences(content)
		.replace(TABLE_PATTERN, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}
