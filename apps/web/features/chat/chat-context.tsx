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
	type ResearchSource,
	type ToolCall,
} from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { useEditorInstance } from '@/features/editor/editor-context'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { toEditorContent } from '@/features/editor/markdown'
import { paginationKey } from '@/features/editor/pagination'
import { editorPlainText } from '@/features/editor/text-content'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { createTab as createTabInDoc } from '@/features/sessions/ydoc'
import { buildSchema, fragmentToJSON, jsonToFragment } from '@/features/sync/serialize'
import { useSync } from '@/features/sync/sync-context'
import { getTemplate } from '@/features/templates/api'
import { useActiveTemplate } from '@/features/templates/use-templates'
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

export interface ChatAttachment {
	text: string
	surrounding: string
	offset: number
	length: number
}

export interface ChatStep {
	id: string
	label: string
	status: 'running' | 'done' | 'failed' | 'cancelled'
	startedAt: number
	endedAt?: number
	detail?: string
	checklist?: { text: string; done: boolean }[]
	/** Hanya untuk langkah riset web - dipakai kartu verifikasi. */
	sources?: ResearchSource[]
}

export interface ChatTurn extends ChatMessage {
	actions?: ToolCall[]
	taskId?: string
	steps?: ChatStep[]
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
				steps: _steps,
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
	steps: ChatStep[]
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
	const { doc, activeDocId, activeId, sessions, comments, addComment } = useSessions()
	const { setup, setPageSetup } = usePageSetup()
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
	// Riset dicatat ke Aktivitas; tautkan ke tab server supaya entrinya tidak
	// yatim di halaman itu.
	const { linkage } = useSync()
	const researchTabRef = useRef<string | null>(null)
	researchTabRef.current = activeId ? (linkage[activeId]?.serverId ?? null) : null
	// Template asal dokumen aktif: slug-nya ikut ke prompt server, spec-nya
	// menjawab alat baca get_template_rules.
	const activeTemplate = useActiveTemplate()
	const templateRef = useRef(activeTemplate)
	templateRef.current = activeTemplate
	const applyActionsRef = useRef<((calls: ToolCall[]) => void) | null>(null)
	const pendingAutoApplyRef = useRef<ToolCall[] | null>(null)
	const messagesRef = useRef<ChatTurn[]>(messages)
	const writeWavesRef = useRef<{ taskId: string | undefined; count: number }>({
		taskId: undefined,
		count: 0,
	})
	const [steps, setSteps] = useState<ChatStep[]>([])
	const stepsRef = useRef<ChatStep[]>([])

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
		doc,
		activeDocId,
		activeId,
		sessions,
		comments,
	})
	appRef.current = {
		setup,
		setPageSetup,
		setTypography,
		doc,
		activeDocId,
		activeId,
		sessions,
		comments,
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

	const setStepsBoth = (next: ChatStep[]) => {
		stepsRef.current = next
		setSteps(next)
	}

	const closeRunning = (status: 'done' | 'failed' | 'cancelled', list: ChatStep[]): ChatStep[] =>
		list.map((step) => (step.status === 'running' ? { ...step, status, endedAt: Date.now() } : step))
	const pushStep = (label: string, detail?: string): string => {
		const now = Date.now()
		const id = `step_${now.toString(36)}_${stepsRef.current.length}`
		setStepsBoth([
			...closeRunning('done', stepsRef.current),
			{ id, label, status: 'running', startedAt: now, detail },
		])
		return id
	}
	const patchRunningStep = (patch: Partial<ChatStep>) => {
		setStepsBoth(
			stepsRef.current.map((step, index) =>
				index === stepsRef.current.length - 1 && step.status === 'running' ? { ...step, ...patch } : step,
			),
		)
	}
	const finishSteps = (): ChatStep[] | undefined => {
		const closed = closeRunning('done', stepsRef.current)
		setStepsBoth(closed)
		return closed.length > 0 ? closed : undefined
	}
	const planRef = useRef<{ stepId: string; next: number } | null>(null)

	const recordPlan = (items: string[]) => {
		const stepId = pushStep(`Rencana ${items.length} langkah`)
		setStepsBoth(
			stepsRef.current.map((step) =>
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
		setStepsBoth(
			stepsRef.current.map((step) =>
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
					},
					{
						onDelta: (delta) => {
							answer += delta
							setStreaming(answer)
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
					const cancelled = closeRunning('cancelled', stepsRef.current)
					setStepsBoth(cancelled)
					const partial = stripFallbackCalls(answer)
					if (partial || cancelled.length > 0) {
						commit([
							...history,
							{
								role: 'assistant',
								content: partial,
								taskId,
								steps: cancelled.length > 0 ? cancelled : undefined,
								usage,
							},
						])
					}
				} else {
					setStepsBoth(closeRunning('failed', stepsRef.current))
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
				const finalTurn: ChatTurn = { ...assistant, steps: finishSteps(), usage }
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
					const remote = await runRemoteReadTool(call, controller.signal, researchTabRef.current)
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
			const step: ChatTurn = { ...assistant, intermediate: !visible && writes.length === 0 }
			commit([...history, step, ...results])
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
			setStepsBoth([])
			planRef.current = null
			writeWavesRef.current = { taskId, count: 0 }

			startTurn(history, taskId)
		},
		[commit, startTurn],
	)
	const runWriteTool = useCallback(
		(call: ToolCall): ToolOutcome => {
			if (appliedActionIds.has(call.id)) return { ok: true, message: 'Sudah diterapkan.' }

			const editor = editorRef.current
			if (!editor) return { ok: false, message: 'Editor belum siap.' }

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
				},
				call,
			)

			if (outcome.ok) setAppliedActionIds((current) => new Set(current).add(call.id))
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
			setStepsBoth([])
			startTurn(next, taskId)
		},
		[commit, currentTaskId, startTurn],
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
		setStepsBoth([])
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
			steps,
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
			steps,
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
