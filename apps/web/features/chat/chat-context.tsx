'use client'

import { generateJSON } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { BriefKey, ProviderErrorCode, TemplateSpec } from '@writer-hub/shared'
import {
	type BriefChapterUpdate,
	type BriefFieldUpdate,
	briefField,
	CHAPTER_STATUSES,
	CHAT_CONTEXT_LIMITS,
	type ChapterStatus,
	type ChatMessage,
	type ChatStreamPhase,
	type ChatUsage,
	DEFAULT_CHAT_MODEL,
	isAskTool,
	isDelegation,
	isReadTool,
	type ToolCall,
	type WorkKind,
	workKindOf,
} from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useBrief } from '@/features/brief/brief-context'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { type DiagramPalette, isCompletePalette, reskinSvg } from '@/features/editor/diagram-skin'
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
import { createTab as createTabInDoc, readAppliedFormat, setAppliedFormat } from '@/features/sessions/ydoc'
import { buildSchema, fragmentToJSON, jsonToFragment } from '@/features/sync/serialize'
import { useSync } from '@/features/sync/sync-context'
import { getTemplate } from '@/features/templates/api'
import { useActiveDocumentMetadata, useActiveTemplate } from '@/features/templates/use-templates'
import { createVersion } from '@/features/versions/api'
import { snapshotLocalVersion } from '@/features/versions/local-snapshot'
import { useInvalidateVersions } from '@/features/versions/use-versions'
import { usePersistentState } from '@/lib/use-persistent-state'
import { parseFallbackCalls, streamChat, stripFallbackCalls } from './api'
import {
	type AskAnswer,
	answerWords,
	askResultText,
	briefAnswerValue,
	parseAskQuestions,
	requestedBriefFields,
	requestMessage,
	responseValue,
} from './ask'
import { diagramReceipt, drawDiagram } from './diagram-api'
import { stitchDiagrams } from './diagram-embed'
import { diagramBlocks, diagramTypeOf, findDiagramBlock, needsDrawing } from './diagram-target'
import { chatFailureHint, toChatTurnError } from './failure'
import { fitWindow, withToolResults } from './outbound-window'
import { isRemoteReadTool, remoteToolLabel, runRemoteReadTool } from './remote-tools'
import {
	continueNudge,
	emptySections,
	isContinuePrompt,
	mayAutoContinue,
	promisesMore,
	type StallReason,
} from './stall'
import {
	applyWriteTool,
	insertDiagramBlock,
	pageSummary,
	type ReadToolContext,
	readToolLabel,
	replaceDiagramBlock,
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
	/**
	 * Pertanyaan kepada penulis (`ask_user`, `request_brief`). Terpisah dari
	 * `actions` karena tidak ada yang bisa "diterapkan" - hanya dijawab - tapi
	 * sama-sama menahan giliran sampai diputuskan.
	 */
	asks?: ToolCall[]
	/** Di giliran hasil alat: jawaban penulis, untuk ringkasan tanya-jawab di percakapan. */
	answer?: AskAnswer
	taskId?: string
	/**
	 * Bagian giliran ini sesuai urutan datangnya. `content` tetap ada dan tetap
	 * memuat seluruh teksnya - ia yang dikirim ke provider; `parts` hanya
	 * mengatur bagaimana giliran itu digambar.
	 */
	parts?: TurnPart[]
	usage?: ChatUsage
	intermediate?: boolean
	/**
	 * Pesan pengguna yang bukan ketikan penulis: dorongan `[Continue]` yang
	 * melanjutkan tugas yang berhenti di tengah - otomatis, atau lewat tombol
	 * "Lanjutkan". Digambar sebagai penanda, bukan gelembung.
	 */
	continuation?: { mode: 'auto' | 'manual'; reason: StallReason }
}

/** Tugas yang berhenti sebelum selesai dan sudah tidak dilanjutkan sendiri. */
export interface ChatStall {
	reason: StallReason
	/** Berapa kali tugas ini sudah dilanjutkan otomatis sebelum berhenti di sini. */
	autoContinues: number
	/** Bagian tingkat satu naskah, dan yang masih tanpa isi. */
	total: number
	empty: string[]
}

const MAX_TOOL_ROUNDS = 12
const MAX_READ_CALLS = 48

const BUDGET_NOTICE =
	'\n\n[System] Read budget for this turn is exhausted. Answer now with what you already have, or propose write tools. Further read tools will not be executed.'

/*
 * Gelombang suntingan beruntun sebelum aplikasi berhenti menyambung giliran
 * sendiri. Dulu gelombang terakhir membawa pesan "Wrap up" ke model, yang
 * secara harfiah menyuruhnya berhenti - model lalu menulis "karena batasan
 * sistem saya tidak bisa melanjutkan". Kini model tidak diberi tahu apa-apa:
 * tugasnya dijeda, lalu dilanjutkan (lihat `stall.ts`).
 */
const MAX_WRITE_WAVES = 8

const BROKEN_ARGS_RESULT =
	'Not carried out: the arguments of this call were cut off or were not valid JSON (a reply that hits the output length limit ends mid-call). Send it again in smaller pieces: one section per insert_content call.'

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
	// Indeks permintaan tugas berjalan: ia ikut di depan jendela, sepanjang apa pun tugasnya.
	let request: number | undefined
	for (const turn of history) {
		if (turn.taskId === currentTaskId) {
			const {
				actions: _actions,
				asks: _asks,
				answer: _answer,
				taskId: _taskId,
				parts: _parts,
				usage: _usage,
				intermediate: _intermediate,
				continuation: _continuation,
				...message
			} = turn
			if (request === undefined && message.role === 'user') request = outbound.length
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
	return fitWindow(withToolResults(outbound), CHAT_CONTEXT_LIMITS.messages, request)
}

export function actionsSettled(history: ChatTurn[], owner: ChatTurn): boolean {
	const decided = new Set(history.filter((turn) => turn.role === 'tool').map((turn) => turn.toolCallId))
	return [...(owner.actions ?? []), ...(owner.asks ?? [])].every((action) => decided.has(action.id))
}

/**
 * Bisakah "lanjut" dari penulis meneruskan tugas ini alih-alih memulai yang
 * baru? Hanya kalau model sudah pernah menjawab di dalamnya dan tidak ada aksi
 * atau pertanyaan yang masih menunggu - panggilan alat tanpa hasil tidak
 * boleh ikut terkirim.
 */
export function resumableTask(history: ChatTurn[], taskId: string | undefined): boolean {
	if (!taskId) return false
	const owners = history.filter((turn) => turn.role === 'assistant' && turn.taskId === taskId)
	return owners.length > 0 && owners.every((owner) => actionsSettled(history, owner))
}

/**
 * Pertanyaan yang sedang menunggu penulis - kalau ada, kartunya menggantikan
 * kotak chat. Hanya giliran pertanyaan terakhir dari tugas yang sedang
 * berjalan yang dihitung: pertanyaan dari tugas lama sudah tidak punya giliran
 * untuk dilanjutkan.
 */
export function pendingAskOf(
	history: readonly ChatTurn[],
	currentTaskId: string | undefined,
): ToolCall | null {
	const settled = new Set(history.filter((turn) => turn.role === 'tool').map((turn) => turn.toolCallId))
	for (let index = history.length - 1; index >= 0; index--) {
		const turn = history[index]
		if (turn.role !== 'assistant' || !turn.asks?.length) continue
		if (turn.taskId !== currentTaskId) return null
		return turn.asks.find((call) => !settled.has(call.id)) ?? null
	}
	return null
}

const EXTRA_ASK_RESULT =
	'Not shown: only one question card is shown at a time. Ask this again, if it still matters, after the writer answers the first.'

/**
 * Argumen `update_brief` dari model, dibaca dengan curiga - yang tidak
 * berbentuk seperti isian atau bab dibuang di sini, bukan di aturan brief.
 */
export function briefUpdateFromArgs(args: Record<string, unknown>): {
	fields: BriefFieldUpdate[]
	chapters: BriefChapterUpdate[]
} {
	const list = (value: unknown): Record<string, unknown>[] =>
		Array.isArray(value)
			? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
			: []
	const text = (value: unknown): string => (typeof value === 'string' ? value : '')

	return {
		fields: list(args.fields).map((field) => ({
			key: text(field.key),
			value: text(field.value),
			...(text(field.evidence) ? { evidence: text(field.evidence) } : {}),
		})),
		chapters: list(args.chapters).map((chapter) => ({
			title: text(chapter.title),
			summary: text(chapter.summary),
			...(CHAPTER_STATUSES.includes(chapter.status as ChapterStatus)
				? { status: chapter.status as ChapterStatus }
				: {}),
		})),
	}
}

const OUTLINE_SNIPPET_CHARS = 600

/**
 * Konteks halaman memberi tahu model bahwa formatnya sudah diterapkan, jadi
 * ia tidak menghabiskan satu putaran untuk mencobanya lagi.
 */
export function withAppliedFormat(page: string, applied: string | null): string {
	if (!applied) return page
	return `${page} The ${applied} format is already applied (the writer may have adjusted it since): do not call apply_template_format again unless the writer explicitly asks to reset the format.`
}

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
	/** Tugas yang berhenti di tengah dan menunggu penulis menekan "Lanjutkan". */
	stall: ChatStall | null
	continueStalled: () => void
	dismissStall: () => void

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
	/** Pertanyaan AI yang menunggu jawaban; kartunya menggantikan kotak chat. */
	pendingAsk: ToolCall | null
	answerAsk: (call: ToolCall, answer: AskAnswer) => void
	/** Jawaban penulis untuk satu pertanyaan yang sudah diputuskan. */
	askAnswer: (id: string) => AskAnswer | undefined
	applyAction: (call: ToolCall) => Promise<ToolOutcome>
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
	/* Brief penelitian ikut di setiap permintaan, dan alat `update_brief` serta
	 * jawaban kartu pertanyaan menulis ke sana - dibaca lewat ref karena
	 * `runTurn` hidup lebih lama dari satu render. */
	const briefApi = useBrief()
	const briefRef = useRef(briefApi)
	briefRef.current = briefApi
	const applyActionsRef = useRef<((calls: ToolCall[]) => void) | null>(null)
	const pendingAutoApplyRef = useRef<ToolCall[] | null>(null)
	const messagesRef = useRef<ChatTurn[]>(messages)
	const writeWavesRef = useRef<{ taskId: string | undefined; count: number }>({
		taskId: undefined,
		count: 0,
	})
	/*
	 * Tugas yang berhenti di tengah. `stallPendingRef` diisi `runTurn` di akhir
	 * giliran dan dibaca sesudah gilirannya ditutup; `continuesRef` menghitung
	 * lanjutan otomatis per tugas.
	 */
	const [stall, setStall] = useState<ChatStall | null>(null)
	const stallPendingRef = useRef<{ reason: StallReason; taskId: string } | null>(null)
	const continuesRef = useRef<{ taskId: string | undefined; auto: number; reason?: StallReason }>({
		taskId: undefined,
		auto: 0,
	})
	const handleStallRef = useRef<((reason: StallReason, taskId: string) => void) | null>(null)
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
	/* Dokumen dari galeri sudah lahir dengan format templatenya. Hanya membaca
	 * ref, jadi aman dipanggil dari callback yang ter-memo. */
	const appliedFormatOf = useCallback((): string | null => {
		const app = appRef.current
		const recorded = app.activeDocId ? readAppliedFormat(app.doc, app.activeDocId) : null
		return recorded ?? templateRef.current?.slug ?? null
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
			page: withAppliedFormat(pageSummary(appRef.current.setup), appliedFormatOf()),
		}
	}, [appliedFormatOf])

	const stop = useCallback(() => {
		// Percobaan ulang yang masih menunggu ikut dibatalkan; tanpa ini
		// percakapan yang sudah dihentikan penulis hidup lagi sedetik kemudian.
		if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
		retryTimerRef.current = null
		retryPendingRef.current = false
		stallPendingRef.current = null
		abortRef.current?.abort()
		abortRef.current = null
		setStreaming(null)
		setStall(null)
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

	/**
	 * Langkah yang berjalan sendiri, di samping pekerjaan model.
	 *
	 * Tidak menutup apa pun dan tidak ikut ditutup, jadi beberapa gambar bisa
	 * berputar sekaligus di dalam satu kelompok. Labelnya menyebut pekerjaannya,
	 * bukan mekanismenya: penulis tidak peduli ada sub-agent, ia peduli mana
	 * dari dua gambar yang belum selesai.
	 */
	const startBackgroundStep = (label: string): string => {
		const now = Date.now()
		const id = `bg_${now.toString(36)}_${flatSteps(partsRef.current).length}`
		setPartsBoth(
			appendStep(partsRef.current, { id, label, status: 'running', startedAt: now, background: true }),
		)
		return id
	}

	const finishStep = (id: string, patch: Partial<ChatStep>) => {
		setPartsBoth(patchStep(partsRef.current, id, { endedAt: Date.now(), ...patch }))
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
	const tabText = (tabId: string): string | null => {
		try {
			const json = fragmentToJSON(appRef.current.doc, tabId)
			const node = buildSchema().nodeFromJSON(json)
			return node.textBetween(0, node.content.size, '\n', ' ')
		} catch {
			return null
		}
	}

	/**
	 * `update_brief`: tulisan AI ke brief, disaring aturan brief. Bukti sebuah
	 * keputusan dicari di seluruh tab dokumen dan di semua yang pernah dikatakan
	 * penulis - pesan dan jawaban kartu pertanyaannya.
	 */
	const runBriefUpdate = (call: ToolCall, history: readonly ChatTurn[]): string => {
		// Dorongan `[Continue]` bukan kata-kata penulis.
		const said = history.flatMap((turn) =>
			turn.role === 'user' && !turn.continuation
				? [turn.content]
				: turn.role === 'tool' && turn.answer
					? answerWords(turn.answer)
					: [],
		)
		const manuscript = appRef.current.sessions.map((tab) => tabText(tab.id) ?? '')
		const report = briefRef.current.applyAiUpdate(briefUpdateFromArgs(call.arguments), [
			...manuscript,
			...said,
		])
		if (!report) return 'No document is open, so nothing was recorded.'

		const lines = [
			report.applied.length > 0 && `Saved: ${report.applied.join(', ')}.`,
			report.proposed.length > 0 &&
				`Proposed to the writer, awaiting their approval: ${report.proposed.join(', ')}.`,
			report.skipped.length > 0 && `Unchanged: ${report.skipped.join(', ')}.`,
			report.rejected.length > 0 &&
				`Rejected: ${report.rejected.map((entry) => `${entry.target} (${entry.reason})`).join('; ')}.`,
		].filter(Boolean)
		return lines.length > 0 ? lines.join('\n') : 'Nothing to record.'
	}

	/*
	 * `request_brief` membuka panel Metadata sendiri - satu-satunya saat panel
	 * itu muncul tanpa diminta, karena isian panjang memang tidak muat di kartu.
	 */
	const announceAsk = (call: ToolCall | undefined) => {
		if (call?.name !== 'request_brief') return
		const message = requestMessage(call.arguments)
		briefRef.current.openPanel({
			highlight: requestedBriefFields(call.arguments),
			...(message ? { message } : {}),
		})
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
			readTab: tabText,
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

	/*
	 * Isian sampul: identitas dari metadata template (nama, NIM, pembimbing),
	 * judul dan jenis karya dari brief. Jenis karya: template dulu - dokumen
	 * skripsi tetap skripsi - lalu brief, lalu skripsi.
	 */

	const frontMatterSource = (): { kind: WorkKind; values: Record<string, string> } => {
		const brief = briefRef.current.snapshot()
		const identity = metadataRef.current ?? {}
		const kind =
			templateRef.current?.spec.frontMatter ?? workKindOf(brief.entries.jenisKarya?.value) ?? 'skripsi'
		const title = brief.entries.judul?.value ?? identity.judul ?? ''
		return { kind, values: { ...identity, ...(title ? { judul: title } : {}) } }
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
			const malformed = new Set<string>()
			let usage: ChatUsage | undefined
			let reasoning = ''
			let finish: string | undefined

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
						brief: briefRef.current.docId ? briefRef.current.snapshot() : undefined,
					},
					{
						onDelta: (delta) => {
							answer += delta
							setStreaming(answer)
							appendText(delta)
						},
						onToolCall: (call, broken) => {
							calls.push(call)
							if (broken) malformed.add(call.id)
						},
						onDone: (reason) => {
							finish = reason
						},
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
			/*
			 * Panggilan yang argumennya terpotong - jawaban yang menabrak batas
			 * panjang keluaran berhenti di tengah JSON - tidak dijalankan dengan
			 * argumen kosong. Ia langsung dijawab, dan model diminta mengirim ulang
			 * dalam potongan yang lebih kecil.
			 */
			const usable = calls.filter((call) => !malformed.has(call.id))
			const reads = usable.filter((call) => isReadTool(call.name))
			const writes = usable.filter((call) => !isReadTool(call.name) && !isAskTool(call.name))
			/*
			 * Satu kartu pertanyaan dalam satu waktu. Pertanyaan tambahan dalam
			 * putaran yang sama langsung dijawab "tidak ditampilkan" - setiap
			 * panggilan alat wajib punya hasil sebelum model bicara lagi.
			 */
			const [ask, ...extraAsks] = usable.filter((call) => isAskTool(call.name))
			const immediateResults: ChatTurn[] = [
				...extraAsks.map((call) => ({ call, content: EXTRA_ASK_RESULT })),
				...calls
					.filter((call) => malformed.has(call.id))
					.map((call) => ({ call, content: BROKEN_ARGS_RESULT })),
			].map(({ call, content }) => ({ role: 'tool', content, toolCallId: call.id, taskId }))

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
				asks: ask ? [ask] : undefined,
			}

			const editor = editorRef.current
			const budgetSpent = round >= MAX_TOOL_ROUNDS || readsUsed >= MAX_READ_CALLS
			const broken = malformed.size > 0
			if ((reads.length === 0 && !broken) || sealed) {
				if (reads.length > 0 && sealed) {
					pushStep('Penelusuran ditutup')
					patchRunningStep({
						status: 'done',
						endedAt: Date.now(),
						detail: 'Model masih meminta bacaan setelah anggaran habis; permintaannya tidak dijalankan.',
					})
				}
				/*
				 * Giliran yang berakhir tanpa suntingan dan tanpa pertanyaan: entah
				 * tugasnya selesai, entah model berhenti di tengah. Yang kedua
				 * ditandai di sini dan ditangani sesudah gilirannya benar-benar
				 * ditutup (`startTurn`).
				 */
				if (writes.length === 0 && !ask) {
					if (calls.length === 0 && !visible.trim()) {
						// Balasan kosong tidak disimpan: percobaan berikutnya mengulang dari langkah yang sama.
						finishParts()
						stallPendingRef.current = { reason: 'empty', taskId }
						return
					}
					if (finish === 'length') stallPendingRef.current = { reason: 'truncated', taskId }
					else if (promisesMore(visible)) stallPendingRef.current = { reason: 'promised', taskId }
				}
				const finalTurn: ChatTurn = { ...assistant, parts: visibleParts(finishParts()), usage }
				commit([...history, finalTurn, ...immediateResults])
				if (writes.length > 0 && autoApplyRef.current) pendingAutoApplyRef.current = writes
				announceAsk(ask)
				return
			}
			const results: ChatTurn[] = [...immediateResults]
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
				if (call.name === 'update_brief') {
					pushStep('Memperbarui metadata')
					const content = runBriefUpdate(call, history)
					patchRunningStep({ status: 'done', endedAt: Date.now(), detail: content })
					results.push({ role: 'tool', content, toolCallId: call.id, taskId })
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
			if (budgetSpent && reads.length > 0) {
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
				intermediate: !visible && writes.length === 0 && !ask && roundParts === undefined,
			}
			/*
			 * Bacaan di putaran yang sama tetap dijalankan - hasilnya harus ada
			 * sebelum model bicara lagi - tapi putarannya berhenti di sini. Model
			 * baru mendapat giliran lagi sesudah penulis menjawab, atau sesudah
			 * suntingan di putaran yang sama diputuskan (`settleActions`).
			 *
			 * Suntingan ikut menahan putaran: dulu putaran ini langsung dikirim
			 * lagi, dengan panggilan tulis yang belum punya hasil. Provider
			 * menolaknya dengan 400, server membacanya sebagai "tool calling tidak
			 * didukung", dan sisa sesi berjalan tanpa alat - chat berhenti
			 * menyunting di tengah jalan.
			 */
			if (ask || writes.length > 0) {
				commit([...history, step, ...results])
				if (writes.length > 0 && autoApplyRef.current) pendingAutoApplyRef.current = writes
				announceAsk(ask)
				return
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
					const stalled = stallPendingRef.current
					stallPendingRef.current = null
					if (stalled && !controller.signal.aborted) handleStallRef.current?.(stalled.reason, stalled.taskId)
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
		setStall(null)
		setStreaming('')
		startTurnRef.current?.(messagesRef.current, currentTaskIdRef.current ?? newTaskId(), false)
	}, [])

	/**
	 * Meneruskan tugas yang berhenti di tengah, dengan `taskId` yang sama -
	 * model tetap melihat seluruh langkahnya - dan rangkaian gelombang
	 * suntingan yang baru. Balasan kosong cukup diulang; sebab lain mendapat
	 * dorongan `[Continue]` yang menyebut bagian naskah yang masih kosong.
	 */
	const continueTask = useCallback(
		(reason: StallReason, mode: 'auto' | 'manual') => {
			const taskId = currentTaskIdRef.current
			if (abortRef.current || !taskId) return

			setStall(null)
			setError(null)
			let history = messagesRef.current
			if (reason !== 'empty') {
				const editor = editorRef.current
				const empty = editor && !editor.isDestroyed ? emptySections(editor.state.doc).empty : []
				history = [
					...history,
					{ role: 'user', content: continueNudge(reason, empty), taskId, continuation: { mode, reason } },
				]
				commit(history)
			}
			writeWavesRef.current = { taskId, count: 0 }
			setStreaming('')
			setPartsBoth([])
			startTurn(history, taskId)
		},
		[commit, startTurn],
	)

	/*
	 * Tugas yang berhenti di tengah dilanjutkan sendiri selama masih ada
	 * jatahnya dan lanjutan sebelumnya menghasilkan sesuatu; sesudah itu kartu
	 * "Lanjutkan" yang menunggu penulis.
	 */
	handleStallRef.current = (reason, taskId) => {
		if (taskId !== currentTaskIdRef.current) return
		const previous =
			continuesRef.current.taskId === taskId ? continuesRef.current : { auto: 0, reason: undefined }
		const auto = previous.auto
		const waves = writeWavesRef.current
		const progressed = waves.taskId === taskId && waves.count > 0
		if (mayAutoContinue(auto, progressed, previous.reason === reason)) {
			continuesRef.current = { taskId, auto: auto + 1, reason }
			continueTask(reason, 'auto')
			return
		}
		const editor = editorRef.current
		const sections = editor && !editor.isDestroyed ? emptySections(editor.state.doc) : { total: 0, empty: [] }
		setStall({ reason, autoContinues: auto, ...sections })
	}

	const continueStalled = useCallback(() => {
		if (!stall) return
		// Penulis sendiri yang meminta: jatah lanjutan otomatisnya dibuka lagi.
		continuesRef.current = { taskId: currentTaskIdRef.current, auto: 0 }
		continueTask(stall.reason, 'manual')
	}, [stall, continueTask])

	const dismissStall = useCallback(() => setStall(null), [])

	const send = useCallback(
		(prompt: string) => {
			const trimmed = prompt.trim()
			if (!trimmed || abortRef.current) return
			/*
			 * "lanjut" meneruskan tugas yang sedang berjalan. Sebagai tugas baru,
			 * seluruh langkah sebelumnya terpangkas dari riwayat dan model
			 * membalas dengan menu "Apa yang ingin Anda kerjakan?".
			 */
			const previous = currentTaskIdRef.current
			const resume = isContinuePrompt(trimmed) && resumableTask(messagesRef.current, previous)
			const taskId = resume && previous ? previous : newTaskId()
			const history: ChatTurn[] = [...messagesRef.current, { role: 'user', content: trimmed, taskId }]
			commit(history)
			setCurrentTaskId(taskId)
			currentTaskIdRef.current = taskId
			setStreaming('')
			setError(null)
			setStall(null)
			setPartsBoth([])
			if (!resume) planRef.current = null
			writeWavesRef.current = { taskId, count: 0 }
			continuesRef.current = { taskId, auto: 0 }

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
					frontMatter: frontMatterSource,
					appliedFormat: appliedFormatOf,
					markFormatApplied: (slug) => {
						const app = appRef.current
						if (app.activeDocId) setAppliedFormat(app.doc, app.activeDocId, slug)
					},
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
		(entries: { call: ToolCall; content: string; answer?: AskAnswer }[]) => {
			const current = messagesRef.current
			const settled = new Set(current.filter((turn) => turn.role === 'tool').map((turn) => turn.toolCallId))
			const fresh = entries.filter((entry) => !settled.has(entry.call.id))
			if (fresh.length === 0) return
			const id = fresh[0].call.id
			const owner = current.find(
				(turn) =>
					turn.role === 'assistant' &&
					(turn.actions?.some((action) => action.id === id) || turn.asks?.some((call) => call.id === id)),
			)
			const taskId = owner?.taskId

			const results: ChatTurn[] = fresh.map((entry) => ({
				role: 'tool' as const,
				content: entry.content,
				toolCallId: entry.call.id,
				taskId,
				...(entry.answer ? { answer: entry.answer } : {}),
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
			// Hanya suntingan yang dihitung: menjawab kartu pertanyaan bukan rangkaian otomatis.
			const waves = writeWavesRef.current
			const previous = waves.taskId === taskId ? waves.count : 0
			const count = owner?.actions?.length ? previous + 1 : previous
			const resumable = complete && taskId === currentTaskId && !abortRef.current

			const next = [...current, ...results]
			commit(next)

			if (!resumable || taskId === undefined) return
			writeWavesRef.current = { taskId, count }

			if (count >= MAX_WRITE_WAVES) {
				handleStallRef.current?.('wave_limit', taskId)
				return
			}
			setStreaming('')
			setPartsBoth([])
			startTurn(next, taskId)
		},
		[commit, currentTaskId, startTurn, snapshotAiResult],
	)

	/**
	 * Aksi menggambar, satu-satunya yang tidak selesai seketika.
	 *
	 * Alat tulis lain menyentuh dokumen dan berakhir di baris yang sama. Yang
	 * ini menunggu sub-agent, jadi ia mendapat langkah latarnya sendiri - dan
	 * yang kembali ke model bukan gambarnya melainkan tanda terima. Di situlah
	 * seluruh penghematannya: markup-nya berjalan dari server langsung ke
	 * dokumen, tanpa singgah di percakapan yang harus dibayar ulang tiap giliran.
	 */
	const runDrawTool = useCallback(async (call: ToolCall): Promise<ToolOutcome> => {
		const editor = editorRef.current
		if (!editor) return { ok: false, message: 'Editor belum siap.' }

		const redraw = call.name === 'redraw_diagram'
		let target: { pos: number; source: string; title: string } | null = null

		if (redraw) {
			const asked = String(call.arguments.title ?? '').trim()
			target = findDiagramBlock(diagramBlocks(editor.state.doc), asked || undefined)
			if (!target) {
				return {
					ok: false,
					message: asked
						? `No diagram titled "${asked}" in the document. List what is there before trying again.`
						: 'The document holds more than one diagram, or none. Name the one to change with "title".',
				}
			}
		}

		const label = redraw
			? `Menggambar ulang "${target?.title || 'diagram'}"`
			: `Menggambar diagram ${String(call.arguments.type ?? '')}`.trim()
		const stepId = startBackgroundStep(label)

		const drawn = await drawDiagram({
			type: redraw ? diagramTypeOf(target?.source ?? '') : String(call.arguments.type ?? ''),
			spec: String((redraw ? call.arguments.change : call.arguments.spec) ?? ''),
			dark: call.arguments.dark === true,
			...(redraw && target ? { previous: target.source } : {}),
			model: modelRef.current,
		})

		if ('error' in drawn) {
			finishStep(stepId, { status: 'failed', detail: drawn.error })
			return { ok: false, message: `The drawing sub-agent failed: ${drawn.error}` }
		}

		if (redraw && target) replaceDiagramBlock(editor, target.pos, drawn.svg)
		else insertDiagramBlock(editor, drawn.svg)

		finishStep(stepId, {
			status: 'done',
			detail: `${drawn.title}${drawn.size ? ` · ${drawn.size.width}x${drawn.size.height}` : ''}`,
		})
		return { ok: true, message: diagramReceipt(drawn, redraw) }
	}, [])

	/**
	 * Rancangan satu halaman yang membawa bagan.
	 *
	 * Gambarnya dibuat lebih dulu, diwarnai mengikuti rancangannya, lalu ditanam
	 * ke penandanya - **semua di sini**, sesudah keduanya selesai. Markup dan
	 * gambar bertemu pertama kali di klien, dan tidak satu pun dari keduanya
	 * pernah melewati konteks model.
	 */
	const runHtmlWithDiagrams = useCallback(
		async (call: ToolCall): Promise<ToolOutcome> => {
			const requested = (call.arguments.diagrams ?? []) as Array<{
				id?: string
				type?: string
				spec?: string
				palette?: Partial<DiagramPalette>
			}>

			const drawn = new Map<string, string>()
			const failed: string[] = []

			for (const entry of requested) {
				const id = String(entry.id ?? '').toLowerCase()
				if (!id) continue

				const stepId = startBackgroundStep(`Menggambar bagan "${id}"`)
				const result = await drawDiagram({
					type: String(entry.type ?? 'architecture'),
					spec: String(entry.spec ?? ''),
					model: modelRef.current,
				})

				if ('error' in result) {
					finishStep(stepId, { status: 'failed', detail: result.error })
					failed.push(id)
					continue
				}

				/*
				 * Diwarnai di sini, bukan diminta ke sub-agent: paletnya milik
				 * rancangan, dan substitusi deterministik tidak bisa merusak tata
				 * letak yang sudah benar - sedangkan model yang menggambar ulang
				 * dengan warna lain bisa.
				 */
				const palette = entry.palette
				drawn.set(id, palette && isCompletePalette(palette) ? reskinSvg(result.svg, palette) : result.svg)
				finishStep(stepId, { status: 'done', detail: result.title })
			}

			const { html, missing } = stitchDiagrams(String(call.arguments.html ?? ''), drawn)
			const outcome = runWriteTool({ ...call, arguments: { ...call.arguments, html } })
			if (!outcome.ok) return outcome

			const notes = [
				failed.length > 0 && `Could not draw: ${failed.join(', ')}.`,
				missing.length > 0 && `These placeholders were left empty: ${missing.join(', ')}.`,
			].filter(Boolean)

			return notes.length > 0 ? { ok: true, message: `${outcome.message} ${notes.join(' ')}` } : outcome
		},
		[runWriteTool],
	)

	const runAsyncTool = useCallback(
		(call: ToolCall): Promise<ToolOutcome> =>
			call.name === 'insert_html_block' ? runHtmlWithDiagrams(call) : runDrawTool(call),
		[runDrawTool, runHtmlWithDiagrams],
	)

	const applyAction = useCallback(
		async (call: ToolCall): Promise<ToolOutcome> => {
			const outcome = needsDrawing(call.name, call.arguments) ? await runAsyncTool(call) : runWriteTool(call)
			settleActions([{ call, content: outcome.message }])
			return outcome
		},
		[runAsyncTool, runWriteTool, settleActions],
	)

	const applyActions = useCallback(
		(calls: ToolCall[]) => {
			/*
			 * Berurutan, bukan berbarengan. Aksi menggambar menyisipkan blok ke
			 * dokumen yang sama, dan dua penyisipan yang berlomba menghitung
			 * posisinya dari keadaan yang sudah berubah.
			 */
			void (async () => {
				const entries: { call: ToolCall; content: string }[] = []
				for (const call of calls) {
					const outcome = needsDrawing(call.name, call.arguments)
						? await runAsyncTool(call)
						: runWriteTool(call)
					entries.push({ call, content: outcome.message })
				}
				settleActions(entries)
			})()
		},
		[runAsyncTool, runWriteTool, settleActions],
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
	/**
	 * Jawaban penulis atas kartu pertanyaan. Jawaban yang ditujukan ke satu
	 * isian brief dicatat sebagai keputusan penulis sendiri - ia yang memilihnya -
	 * lalu gilirannya dilanjutkan dengan jawaban itu sebagai hasil alat.
	 */
	const answerAsk = useCallback(
		(call: ToolCall, answer: AskAnswer) => {
			const saved: BriefKey[] = []
			const unfit: BriefKey[] = []
			const delegated: BriefKey[] = []
			let final = answer

			if (!answer.skipped && call.name === 'ask_user') {
				const questions = parseAskQuestions(call.arguments)
				answer.responses?.forEach((response, index) => {
					const question = questions[index]
					if (!question?.briefField || !responseValue(response)) return
					if (isDelegation(responseValue(response))) {
						delegated.push(question.briefField)
						return
					}
					const value = briefAnswerValue(question, response)
					if (value === null) {
						unfit.push(question.briefField)
						return
					}
					briefRef.current.saveWriterAnswer(question.briefField, value)
					saved.push(question.briefField)
				})
			}

			if (call.name === 'request_brief') {
				// Yang dikembalikan ke model adalah isi brief SAAT penulis selesai,
				// bukan apa yang diminta - penulis boleh mengisi sebagian saja.
				const brief = briefRef.current.snapshot()
				const keys = requestedBriefFields(call.arguments)
				if (!answer.skipped) {
					final = {
						filled: keys
							.filter((key) => brief.entries[key])
							.map((key) => ({
								key,
								label: briefField(key)?.label ?? key,
								value: brief.entries[key]?.value ?? '',
							})),
						empty: keys.filter((key) => !brief.entries[key]),
					}
				}
				briefRef.current.clearRequest()
			}

			settleActions([{ call, content: askResultText(call, final, saved, unfit, delegated), answer: final }])
		},
		[settleActions],
	)

	const startNewTopic = useCallback(() => {
		setCurrentTaskId(newTaskId())
		setStall(null)
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
		continuesRef.current = { taskId: undefined, auto: 0 }
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
	const answers = useMemo(
		() =>
			new Map(
				messages
					.filter((turn) => turn.role === 'tool' && turn.toolCallId && turn.answer)
					.map((turn) => [turn.toolCallId as string, turn.answer as AskAnswer]),
			),
		[messages],
	)
	// Selama model masih bekerja tidak ada yang menunggu penulis.
	const pendingAsk = useMemo(
		() => (streaming === null ? pendingAskOf(messages, currentTaskId) : null),
		[messages, currentTaskId, streaming],
	)

	const value = useMemo<ChatContextValue>(
		() => ({
			messages,
			streaming,
			parts,
			isRunning: streaming !== null,
			error,
			retry,
			stall,
			continueStalled,
			dismissStall,
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
			pendingAsk,
			answerAsk,
			askAnswer: (id: string) => answers.get(id),
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
			stall,
			continueStalled,
			dismissStall,
			attachment,
			includeDocument,
			send,
			stop,
			reset,
			startNewTopic,
			currentTaskId,
			pendingAsk,
			answerAsk,
			answers,
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
