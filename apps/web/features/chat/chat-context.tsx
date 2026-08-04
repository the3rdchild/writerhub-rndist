'use client'

import type { ChatMessage, ToolCall } from '@writer-hub/shared'
import { isReadTool } from '@writer-hub/shared'
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { useEditorInstance } from '@/features/editor/editor-context'
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
}

/** Batas putaran alat baca dalam satu giliran. */
const MAX_TOOL_ROUNDS = 4

function toWireMessage({ actions: _actions, ...message }: ChatTurn): ChatMessage {
	return message
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

	/** Jalankan aksi tulis yang disetujui pengguna lewat kartu aksi. */
	applyAction: (call: ToolCall) => ToolOutcome
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
		return {
			title: document.title || undefined,
			selection: current?.text,
			surrounding: current?.surrounding,
			document: whole ? document.text : undefined,
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
		async (history: ChatTurn[], round: number, controller: AbortController): Promise<void> => {
			let answer = ''
			const calls: ToolCall[] = []

			await streamChat(
				{ messages: history.map(toWireMessage), context: buildContext(), tools: toolsRef.current },
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

			if (!visible && calls.length === 0) return

			const assistant: ChatTurn = {
				role: 'assistant',
				content: visible,
				toolCalls: calls.map((call) => ({
					id: call.id,
					name: call.name,
					arguments: JSON.stringify(call.arguments),
				})),
				actions: writes.length > 0 ? writes : undefined,
			}

			const editor = editorRef.current
			if (reads.length === 0 || round >= MAX_TOOL_ROUNDS || !editor) {
				setMessages((current) => [...current, assistant])
				return
			}

			const results: ChatTurn[] = reads.map((call) => ({
				role: 'tool',
				content: runReadTool(editor, call),
				toolCallId: call.id,
			}))

			setMessages((current) => [...current, assistant, ...results])
			setStreaming('')
			await runTurn([...history, assistant, ...results], round + 1, controller)
		},
		// buildContext dan editorRef dibaca lewat ref/closure segar tiap panggilan.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	)

	const send = useCallback(
		(prompt: string) => {
			const trimmed = prompt.trim()
			if (!trimmed || abortRef.current) return

			const history: ChatTurn[] = [...messages, { role: 'user', content: trimmed }]
			setMessages(history)
			setStreaming('')
			setError(null)

			const controller = new AbortController()
			abortRef.current = controller

			runTurn(history, 0, controller)
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
			const editor = editorRef.current
			if (!editor) return { ok: false, message: 'Editor belum siap.' }

			return applyWriteTool(
				{
					editor,
					addComment,
					openPanel: setActivePanel,
					runModule: (feature) =>
						markRun(feature, { text: state.text, offset: 0, scoped: false, language: language.code }),
				},
				call,
			)
		},
		[addComment, setActivePanel, markRun, state.text, language.code],
	)

	const reset = useCallback(() => {
		stop()
		setMessages([])
		setStreaming(null)
		setError(null)
		setAttachment(null)
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
			applyAction,
		}),
		[messages, streaming, error, attachment, includeDocument, send, stop, reset, applyAction],
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
