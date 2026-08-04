import type { ChatContext, ChatMessage, ChatStreamEvent } from '@writer-hub/shared'

/**
 * Kirim satu giliran percakapan dan alirkan jawabannya.
 *
 * Tidak memakai `streamJob`: helper itu menunggu satu event terminal lalu
 * menyelesaikan Promise - bentuk yang pas untuk job batch, tapi tidak untuk
 * jawaban yang datang berkeping-keping. Di sini tiap keping diteruskan lewat
 * `onDelta` dan Promise-nya baru selesai saat giliran ditutup.
 *
 * EventSource juga tidak dipakai karena hanya bisa GET, sedangkan percakapan
 * membawa riwayat dan konteks dokumen di body.
 */
export async function streamChat(
	{ messages, context }: { messages: ChatMessage[]; context?: ChatContext },
	onDelta: (text: string) => void,
	signal?: AbortSignal,
): Promise<void> {
	const response = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ messages, context }),
		signal,
	})

	if (!response.ok || !response.body) {
		const body = await response.json().catch(() => null)
		const detail = body?.errors?.join(', ') || body?.message
		throw new Error(detail || `Percakapan gagal (${response.status})`)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value, { stream: true })

		// Satu chunk jaringan tidak selalu berisi baris utuh; sisa potongannya
		// disimpan sampai barisnya lengkap.
		const lines = buffer.split('\n')
		buffer = lines.pop() ?? ''

		for (const line of lines) {
			const trimmed = line.trim()
			if (!trimmed.startsWith('data:')) continue

			let event: ChatStreamEvent
			try {
				event = JSON.parse(trimmed.slice(5).trim()) as ChatStreamEvent
			} catch {
				continue
			}

			if (event.type === 'delta') onDelta(event.text)
			else if (event.type === 'error') throw new Error(event.message)
			else if (event.type === 'done') return
		}
	}
}
