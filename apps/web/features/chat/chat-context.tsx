'use client'

import type { ChatMessage } from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import { streamChat } from './api'

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

interface ChatContextValue {
	messages: ChatMessage[]
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
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
	const { state } = useDocument()
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [streaming, setStreaming] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [attachment, setAttachment] = useState<ChatAttachment | null>(null)
	const [includeDocument, setIncludeDocument] = useState(false)

	const abortRef = useRef<AbortController | null>(null)

	const stop = useCallback(() => {
		abortRef.current?.abort()
		abortRef.current = null
	}, [])

	const send = useCallback(
		(prompt: string) => {
			const trimmed = prompt.trim()
			if (!trimmed || abortRef.current) return

			const history: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
			setMessages(history)
			setStreaming('')
			setError(null)

			const controller = new AbortController()
			abortRef.current = controller

			// Konteks dirakit saat kirim, bukan saat diketik: naskah bisa berubah
			// selama pengguna menyusun pertanyaannya.
			const context = {
				title: state.title || undefined,
				selection: attachment?.text,
				surrounding: attachment?.surrounding,
				document: includeDocument ? state.text : undefined,
			}

			let answer = ''

			streamChat(
				{ messages: history, context },
				(delta) => {
					answer += delta
					setStreaming(answer)
				},
				controller.signal,
			)
				.then(() => {
					if (answer.trim()) {
						setMessages((current) => [...current, { role: 'assistant', content: answer }])
					}
				})
				.catch((cause: unknown) => {
					// Pembatalan oleh pengguna bukan kegagalan; jawaban separuh jalan
					// tetap disimpan supaya tidak hilang percuma.
					if (controller.signal.aborted) {
						if (answer.trim()) {
							setMessages((current) => [...current, { role: 'assistant', content: answer }])
						}
						return
					}
					setError(cause instanceof Error ? cause.message : 'Percakapan gagal')
				})
				.finally(() => {
					abortRef.current = null
					setStreaming(null)
				})
		},
		[messages, attachment, includeDocument, state.title, state.text],
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
		}),
		[messages, streaming, error, attachment, includeDocument, send, stop, reset],
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

	return proposals
}

/** Isi jawaban tanpa blok usulan - bagian yang dibaca sebagai penjelasan. */
export function stripProposals(content: string): string {
	return content.replace(/```[\w-]*\n[\s\S]*?```/g, '').trim()
}
