'use client'

import type { Editor } from '@tiptap/react'
import { CHAT_CONTEXT_LIMITS, type ChatMessage, type ToolCall } from '@writer-hub/shared'
import { isReadTool } from '@writer-hub/shared'
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { useEditorInstance } from '@/features/editor/editor-context'
import { editorPlainText } from '@/features/editor/text-content'
import { useSessions } from '@/features/sessions/session-context'
import { parseFallbackCalls, streamChat, stripFallbackCalls } from './api'
import { applyWriteTool, runReadTool, type ToolOutcome } from './tools'

/**
 * Percakapan dengan AI di panel samping.
 *
 * Riwayatnya hidup di memori saja: satu sesi tanya-jawab tentang naskah yang
 * sedang dibuka, bukan arsip yang perlu dibawa ke kunjungan berikutnya.
 * Menyimpannya ke tab berarti tiap draf membawa transkrip yang hampir tidak
 * pernah dibaca ulang.
 */

/** Potongan naskah yang ditempelkan ke giliran berikutnya. */
export interface ChatAttachment {
	text: string
	surrounding: string
	/** Koordinat teks polos, dipakai saat usulan diterapkan kembali. */
	offset: number
	length: number
}

/**
 * Satu giliran percakapan, plus aksi tulis yang menunggu persetujuan.
 *
 * `actions` tidak pernah ikut dikirim ke provider - ia hanya milik UI.
 */
export interface ChatTurn extends ChatMessage {
	actions?: ToolCall[]
	/** Batas tugas: semua giliran dari satu pesan pengguna berbagi id ini. */
	taskId?: string
}

/** Batas putaran alat baca dalam satu giliran. */
const MAX_TOOL_ROUNDS = 4

/** Id batas tugas baru. crypto.randomUUID bila ada, mundur ke counter waktu. */
function newTaskId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

/**
 * Susun riwayat untuk dikirim ke provider, dengan pemadatan batas tugas.
 *
 * Tugas yang sedang berjalan (`currentTaskId`) dikirim utuh - termasuk pesan
 * `tool` dan `tool_calls`-nya - supaya model bisa melanjutkan pekerjaan alat
 * yang belum selesai. Tugas-tugas LAMA dipangkas: pesan `tool` dibuang dan
 * `tool_calls` asisten dicabut, hanya menyisakan teks pertanyaan/jawaban.
 *
 * Inilah penyangga utama bug "AI meneruskan tugas sebelumnya": tanpa pemadatan,
 * `tool_calls` lama yang tak berbuah hasil terbaca model sebagai pekerjaan
 * yang belum selesai. Lihat EDITOR-AI-UPGRADE-PRD §B2.
 */
export function buildOutboundMessages(history: ChatTurn[], currentTaskId: string | undefined): ChatMessage[] {
	const outbound: ChatMessage[] = []
	for (const turn of history) {
		// Tugas berjalan: utuh, hanya buang bidang milik UI.
		if (turn.taskId === currentTaskId) {
			const { actions: _actions, taskId: _taskId, ...message } = turn
			outbound.push(message)
			continue
		}

		// Tugas lama: pangkas rincian alatnya.
		if (turn.role === 'tool') continue
		if (turn.role === 'assistant') {
			// `tool_calls` lama dibuang; teks jawaban disimpan bila ada.
			if (turn.content) outbound.push({ role: 'assistant', content: turn.content })
			continue
		}
		outbound.push({ role: turn.role, content: turn.content })
	}
	return outbound
}

/** Panjang maksimum potongan awal naskah pada ringkasan kerangka. */
const OUTLINE_SNIPPET_CHARS = 600

/**
 * Ringkasan murah dari tab aktif untuk konteks chat bawaan.
 *
 * Dua bagian: daftar heading (struktur) dan potongan awal naskah (isi). Cukup
 * untuk membuat model tahu dokumen tidak kosong dan apa bahasannya, tanpa
 * mengirim teks penuh tiap giliran. Sumbernya editor aktif, jadi selalu segar.
 *
 * Berkas dokumen tanpa heading punya cerita: potongan awalnya tetap dikirim,
 * jadi paragraf pertama yang ditulis pengguna tetap terlihat model.
 */
function editorOutlineSummary(editor: Editor): string | undefined {
	const doc = editor.state.doc
	const lines: string[] = []

	// Heading dibaca langsung dari ProseMirror, pola yang sama dengan use-outline
	// dan alat get_outline - tidak ada sumber kebenaran kedua.
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
	// Potongan awal selalu disertakan supaya dokumen tanpa heading juga dikenali.
	parts.push(`Opening:\n${plain.slice(0, OUTLINE_SNIPPET_CHARS).trim()}`)
	return parts.join('\n\n')
}

interface ChatContextValue {
	messages: ChatTurn[]
	/** Jawaban yang sedang mengalir; null saat tidak ada giliran berjalan. */
	streaming: string | null
	isRunning: boolean
	error: string | null

	attachment: ChatAttachment | null
	attach: (attachment: ChatAttachment) => void
	clearAttachment: () => void

	/** Sertakan seluruh naskah, bukan hanya sekitar seleksi. */
	includeDocument: boolean
	setIncludeDocument: (value: boolean) => void

	send: (prompt: string) => void
	stop: () => void
	reset: () => void

	/** Buka batas tugas baru tanpa menghapus transkrip; kartu aksi lama kedaluwarsa. */
	startNewTopic: () => void
	/** Id tugas yang sedang berjalan; dipakai UI untuk mengenali kartu aksi kedaluwarsa. */
	currentTaskId: string | undefined

	/** Jalankan aksi tulis yang disetujui pengguna lewat kartu aksi. */
	applyAction: (call: ToolCall) => ToolOutcome
	/** Apakah sebuah panggilan alat sudah pernah diterapkan (anti-terap-ganda). */
	isActionApplied: (id: string) => boolean
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
	const { state } = useDocument()
	const { editor } = useEditorInstance()
	const { setActivePanel, markRun } = usePanels()
	const { addComment } = useSessions()
	const language = useDocumentLanguage()
	const [messages, setMessages] = useState<ChatTurn[]>([])
	const [streaming, setStreaming] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [attachment, setAttachment] = useState<ChatAttachment | null>(null)
	const [includeDocument, setIncludeDocument] = useState(false)
	const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(undefined)
	/** toolCallId yang sudah diterapkan - lihat M5 (anti-terap-ganda). */
	const [appliedActionIds, setAppliedActionIds] = useState<Set<string>>(() => new Set())

	const abortRef = useRef<AbortController | null>(null)

	/*
	 * Giliran berjalan sebagai rantai async yang bisa berputar beberapa kali,
	 * jadi ia membaca editor dan konteks lewat ref - bukan lewat closure yang
	 * sudah basi sejak putaran pertama.
	 */
	const editorRef = useRef(editor)
	editorRef.current = editor

	/** Dimatikan begitu provider terbukti menolak tool calling. */
	const toolsRef = useRef(true)

	const contextRef = useRef({ attachment, includeDocument, state })
	contextRef.current = { attachment, includeDocument, state }

	// Konteks dirakit saat kirim, bukan saat diketik: naskah bisa berubah
	// selama pengguna menyusun pertanyaannya.
	const buildContext = useCallback(() => {
		const { attachment: current, includeDocument: whole, state: document } = contextRef.current

		/*
		 * Isi dokumen dibaca langsung dari editor aktif, bukan dari `state.text`.
		 * `state.text` hanya diperbarui saat pengguna mengetik (lewat `onUpdate`),
		 * jadi pada tab yang baru dibuka - sebelum satu ketukan pun - ia bisa kosong
		 * dan chat melaporkan "dokumen masih kosong". Editor selalu memegang isi
		 * tab aktif yang sebenarnya (didukung Y.Doc), dan inilah sumber kebenaran.
		 *
		 * Chat selalu diberi akses ke tab aktif, jadi ia tidak pernah mengira
		 * dokumen kosong padahal isinya ada. Dua kedalaman:
		 *
		 * - `includeDocument` mati (bawaan): ringkasan kerangka + potongan awal.
		 *   Murah, cukup untuk tahu dokumen tidak kosong dan strukturnya apa.
		 * - `includeDocument` nyala: teks penuh, dibatasi CHAT_CONTEXT_LIMITS.
		 */
		const editor = editorRef.current
		let documentText: string | undefined
		if (editor && !editor.isDestroyed) {
			documentText = whole
				? editorPlainText(editor).slice(0, CHAT_CONTEXT_LIMITS.document)
				: editorOutlineSummary(editor)
		} else {
			// Cadangan saat editor belum siap: state, seadanya. Tetap dipangkas -
			// naskah yang lebih panjang dari batas DTO ditolak API dengan 400.
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
		}
	}, [])

	const stop = useCallback(() => {
		abortRef.current?.abort()
		abortRef.current = null
	}, [])

	/**
	 * Satu giliran, termasuk kelanjutannya setelah alat baca dijalankan.
	 *
	 * Alat baca tidak mengubah apa pun, jadi hasilnya langsung dikembalikan ke
	 * model dan percakapan berlanjut sendiri - itulah yang membuat AI bisa
	 * membaca kerangka lalu memutuskan bagian mana yang perlu dibuka. Alat tulis
	 * berhenti di sini sebagai kartu aksi; pengguna yang memutuskan.
	 *
	 * Putarannya dibatasi supaya model yang salah paham tidak terus meminta
	 * bacaan sampai kuota habis.
	 */
	const runTurn = useCallback(
		async (history: ChatTurn[], round: number, controller: AbortController, taskId: string): Promise<void> => {
			let answer = ''
			const calls: ToolCall[] = []

			await streamChat(
				{ messages: buildOutboundMessages(history, taskId), context: buildContext(), tools: toolsRef.current },
				{
					onDelta: (delta) => {
						answer += delta
						setStreaming(answer)
					},
					onToolCall: (call) => calls.push(call),
					onToolsUnsupported: () => {
						toolsRef.current = false
					},
				},
				controller.signal,
			)

			// Jalur cadangan: panggilan yang ditulis sebagai blok teks.
			calls.push(...parseFallbackCalls(answer))

			const visible = stripFallbackCalls(answer)
			const reads = calls.filter((call) => isReadTool(call.name))
			const writes = calls.filter((call) => !isReadTool(call.name))

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
			// Giliran terminal. Termasuk giliran kosong (M6): ia tetap masuk riwayat
			// sebagai penanda, bukan return diam-diam yang meninggalkan pertanyaan
			// pengguna tanpa jawaban di mata model.
			if (reads.length === 0 || round >= MAX_TOOL_ROUNDS || !editor) {
				setMessages((current) => [...current, assistant])
				return
			}

			const results: ChatTurn[] = reads.map((call) => ({
				role: 'tool',
				content: runReadTool(editor, call),
				toolCallId: call.id,
				taskId,
			}))

			setMessages((current) => [...current, assistant, ...results])
			setStreaming('')
			await runTurn([...history, assistant, ...results], round + 1, controller, taskId)
		},
		// buildContext dan editorRef dibaca lewat ref/closure segar tiap panggilan.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	)

	const send = useCallback(
		(prompt: string) => {
			const trimmed = prompt.trim()
			if (!trimmed || abortRef.current) return

			// Setiap pesan pengguna membuka batas tugas baru (M1). Kartu aksi tugas
			// sebelumnya otomatis kedaluwarsa karena currentTaskId bergeser.
			const taskId = newTaskId()
			const history: ChatTurn[] = [...messages, { role: 'user', content: trimmed, taskId }]
			setMessages(history)
			setCurrentTaskId(taskId)
			setStreaming('')
			setError(null)

			const controller = new AbortController()
			abortRef.current = controller

			runTurn(history, 0, controller, taskId)
				.catch((cause: unknown) => {
					// Pembatalan oleh pengguna bukan kegagalan.
					if (controller.signal.aborted) return
					setError(cause instanceof Error ? cause.message : 'Percakapan gagal')
				})
				.finally(() => {
					abortRef.current = null
					setStreaming(null)
				})
		},
		[messages, runTurn],
	)

	/** Jalankan satu aksi tulis yang sudah disetujui pengguna. */
	const applyAction = useCallback(
		(call: ToolCall): ToolOutcome => {
			// M5: toolCallId yang sudah diterapkan tidak menulis dua kali,
			// sekalipun tombol Apply-nya ditekan lagi.
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
				},
				call,
			)

			if (outcome.ok) setAppliedActionIds((current) => new Set(current).add(call.id))
			return outcome
		},
		[appliedActionIds, addComment, setActivePanel, markRun, state.text, language.code],
	)

	/** Buka batas tugas baru tanpa menghapus transkrip (M7). */
	const startNewTopic = useCallback(() => {
		// currentTaskId bergeser ke id segar yang tidak dimiliki pesan mana pun,
		// jadi seluruh kartu aksi yang masih tertunda otomatis kedaluwarsa.
		setCurrentTaskId(newTaskId())
	}, [])

	const reset = useCallback(() => {
		stop()
		setMessages([])
		setStreaming(null)
		setError(null)
		setAttachment(null)
		setAppliedActionIds(new Set())
		setCurrentTaskId(undefined)
	}, [stop])

	const value = useMemo<ChatContextValue>(
		() => ({
			messages,
			streaming,
			isRunning: streaming !== null,
			error,
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
			isActionApplied: (id: string) => appliedActionIds.has(id),
		}),
		[
			messages,
			streaming,
			error,
			attachment,
			includeDocument,
			send,
			stop,
			reset,
			startNewTopic,
			currentTaskId,
			applyAction,
			appliedActionIds,
		],
	)

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
	const context = useContext(ChatContext)
	if (!context) throw new Error('useChat harus dipakai di dalam <ChatProvider>')
	return context
}

/**
 * Blok berpagar dalam jawaban dianggap usulan teks pengganti.
 *
 * Ini kontrak dengan prompt sistem di apps/api: teks yang dimaksudkan untuk
 * masuk ke dokumen ditulis di dalam pagar, prosa penjelas di luarnya. Dengan
 * begitu tombol Apply muncul hanya untuk yang memang siap ditempelkan.
 */
export function extractProposals(content: string): string[] {
	const proposals: string[] = []
	const fence = /```[\w-]*\n([\s\S]*?)```/g

	let match = fence.exec(content)
	while (match !== null) {
		const text = match[1].trim()
		if (text) proposals.push(text)
		match = fence.exec(content)
	}

	// Tabel hampir tidak pernah ditulis model di dalam pagar - ia menganggapnya
	// bagian dari jawaban, bukan blok kode. Tanpa ini, "buatkan tabel" berakhir
	// sebagai teks di gelembung chat tanpa satu pun tombol untuk memasukkannya.
	for (const table of extractTables(stripFences(content))) proposals.push(table)

	return proposals
}

const FENCE_PATTERN = /```[\w-]*\n[\s\S]*?```/g
/** Baris tabel berturut-turut; baris pemisah wajib, itu yang membedakannya dari teks. */
const TABLE_PATTERN = /(?:^\|.*\|[ \t]*\n)(?:^\|[\s:|-]*-[\s:|-]*\|[ \t]*\n)(?:^\|.*\|[ \t]*\n?)*/gm

function stripFences(content: string): string {
	return content.replace(FENCE_PATTERN, '')
}

function extractTables(content: string): string[] {
	return (content.match(TABLE_PATTERN) ?? []).map((table) => table.trim()).filter(Boolean)
}

/** Isi jawaban tanpa blok usulan - bagian yang dibaca sebagai penjelasan. */
export function stripProposals(content: string): string {
	return (
		stripFences(content)
			.replace(TABLE_PATTERN, '')
			// Blok yang dicabut meninggalkan baris kosong bertumpuk, dan prosa
			// dirender apa adanya (whitespace-pre-wrap) - jadi celahnya terlihat.
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	)
}
