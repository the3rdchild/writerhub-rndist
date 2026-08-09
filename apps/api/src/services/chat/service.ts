import {
	type ChatContext,
	type ChatMessage,
	type ChatStreamEvent,
	type StyleMemory,
	fallbackToolPrompt,
	toProviderTools,
} from '@writer-hub/shared'
import { env } from '@/config/env'
import { findMemoryByOwner } from '@/repository/memory'
import JobSubmissionService from '@/services/job-submission.service'
import { type ChatBody, chatBodySchema } from './dto'

/**
 * `POST /api/v1/chat` - percakapan dengan AI, dialirkan token per token.
 *
 * Sengaja tidak lewat antrean seperti modul analisis. Job batch cocok untuk
 * pekerjaan berat yang boleh selesai belakangan; percakapan harus mulai
 * membalas dalam hitungan ratusan milidetik, dan jawaban yang muncul sekaligus
 * setelah sepuluh detik terasa seperti aplikasi yang menggantung.
 *
 * Yang diwarisi dari JobSubmissionService hanya autentikasi dan resolusi
 * provider - bagian yang sama persis dengan modul lain.
 */
export default class ChatService extends JobSubmissionService {
	async stream(): Promise<Response> {
		try {
			const parsed = chatBodySchema.safeParse(await this.context.req.json().catch(() => ({})))
			if (!parsed.success) {
				return this.error({ errors: parsed.error.issues.map((issue) => issue.message) })
			}

			const provider = await this.authorizeAndResolveProvider()

			// AI Memory dibaca di server dari userId - klien TIDAK mengirimnya,
			// supaya preferensi tidak bisa dipalsukan per request. `buildMessages`
			// tetap fungsi murni; pengambilan dari DB terjadi di sini.
			const userId = this.context.get('userId')
			const memory = userId ? ((await findMemoryByOwner(userId))?.preferences ?? null) : null

			// Mode lokal tidak punya provider dari admin-ppe; kredensial di env API
			// yang dipakai. Kalau itu pun kosong, lebih baik bilang sekarang
			// daripada memberi stream yang langsung gagal.
			const baseUrl = provider?.baseUrl || env.AI_BASE_URL
			const apiKey = provider?.apiKey || env.AI_API_KEY
			const model = provider?.modelId || env.AI_MODEL

			if (!baseUrl || !apiKey) {
				return this.error({
					errors: ['Provider AI belum dikonfigurasi untuk percakapan.'],
					status: 503,
				})
			}

			const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
			const call = (withTools: boolean) =>
				fetch(url, {
					method: 'POST',
					headers: {
						authorization: `Bearer ${apiKey}`,
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						model,
						stream: true,
						temperature: 0.4,
						messages: buildMessages(parsed.data, withTools, memory),
						...(withTools ? { tools: toProviderTools(), tool_choice: 'auto' } : {}),
					}),
					signal: this.context.req.raw.signal,
				})

			const wantsTools = parsed.data.tools
			let upstream = await call(wantsTools)
			let toolsRejected = false

			/*
			 * Model yang dipakai di produksi datang dari admin-ppe per pengguna, jadi
			 * dukungan tool calling tidak bisa dipastikan di muka. Penolakan 4xx
			 * diperlakukan sebagai "provider ini tidak mendukungnya": permintaan
			 * diulang tanpa `tools`, dengan protokol blok teks di prompt-nya.
			 */
			if (wantsTools && !upstream.ok && upstream.status >= 400 && upstream.status < 500) {
				toolsRejected = true
				upstream = await call(false)
			}

			if (!upstream.ok || !upstream.body) {
				const detail = await upstream.text().catch(() => '')
				/*
				 * Kredensial yang ditolak diberi nama sendiri.
				 *
				 * Label bawaan `this.error` adalah "Bad Request", dan itu menyesatkan
				 * di sini: yang salah bukan permintaan yang dikirim pengguna,
				 * melainkan kunci API yang dipakai server. Yang membaca pesannya akan
				 * memeriksa isi percakapan lebih dulu, padahal jawabannya ada di env.
				 */
				const credentialsRejected = upstream.status === 401 || upstream.status === 403
				return this.error({
					message: credentialsRejected
						? 'Kunci API provider AI ditolak - periksa AI_API_KEY'
						: 'Provider AI gagal menjawab',
					errors: [`Provider AI membalas ${upstream.status}`, detail.slice(0, 300)].filter(Boolean),
					status: 502,
				})
			}

			return new Response(toEventStream(upstream.body, toolsRejected), {
				headers: {
					'content-type': 'text/event-stream; charset=utf-8',
					'cache-control': 'no-cache, no-transform',
					connection: 'keep-alive',
					'x-accel-buffering': 'no',
				},
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}
}

const SYSTEM_PROMPT = [
	'You are a writing assistant embedded in a document editor.',
	'Answer in the same language the user writes in.',
	'Be concise and concrete; skip pleasantries and restating the question.',
	'When you propose replacement text for the document, put exactly that text',
	'in a fenced code block and nothing else inside the fence, so the editor can',
	'offer it as a one-click replacement. Use prose for everything else.',
	'Write document content as Markdown. Use $…$ only for mathematics -',
	'never write a full LaTeX document.',
].join(' ')

/** Rangkai konteks dokumen jadi pesan sistem tambahan. */
function contextMessage(context: ChatContext | undefined): ChatMessage | null {
	if (!context) return null

	const parts: string[] = []
	if (context.title) parts.push(`Document title: ${context.title}`)
	if (context.document) parts.push(`Full document:\n${context.document}`)
	else if (context.surrounding) parts.push(`Surrounding text:\n${context.surrounding}`)
	if (context.selection) parts.push(`Selected text the user is asking about:\n${context.selection}`)

	if (parts.length === 0) return null
	return { role: 'user', content: `[Editor context]\n${parts.join('\n\n')}` }
}

/**
 * Ubah riwayat kita jadi bentuk yang dimengerti provider.
 *
 * Giliran asisten yang meminta alat dan jawaban alatnya punya bentuk khusus di
 * API OpenAI (`tool_calls` dan `tool_call_id`), dan keduanya wajib ada supaya
 * model bisa melanjutkan percakapan setelah alatnya dijalankan.
 */
function toProviderMessage(message: ChatBody['messages'][number]): Record<string, unknown> {
	if (message.role === 'tool') {
		return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
	}

	if (message.role === 'assistant' && message.toolCalls?.length) {
		return {
			role: 'assistant',
			content: message.content || null,
			tool_calls: message.toolCalls.map((call) => ({
				id: call.id,
				type: 'function',
				function: { name: call.name, arguments: call.arguments },
			})),
		}
	}

	return { role: message.role, content: message.content }
}

function buildMessages({ messages, context }: ChatBody, withTools: boolean, memory: StyleMemory | null): unknown[] {
	const contextPart = contextMessage(context)

	// Saat provider menolak `tools`, protokolnya dijelaskan lewat prompt supaya
	// kemampuannya tidak hilang sama sekali - hanya jalurnya yang berbeda.
	let system = withTools
		? `${SYSTEM_PROMPT}\n\n${TOOL_GUIDANCE}`
		: `${SYSTEM_PROMPT}\n\n${fallbackToolPrompt()}`

	// Preferensi gaya dari AI Memory ditempel sesudah panduan tool; bloknya
	// kosong (prompt persis seperti sebelumnya) bila user belum mengisinya.
	const memoryBlock = memoryPrompt(memory)
	if (memoryBlock) system = `${system}\n\n${memoryBlock}`

	return [
		{ role: 'system', content: system },
		// Konteks diletakkan sebelum riwayat: ia latar, bukan giliran percakapan.
		...(contextPart ? [contextPart] : []),
		...messages.map(toProviderMessage),
	]
}

/**
 * Rangkai AI Memory user jadi blok instruksi gaya untuk system prompt.
 * Bahasanya mengikuti prompt yang sudah ada (Inggris).
 */
function memoryPrompt(memory: StyleMemory | null): string {
	if (!memory) return ''

	const lines: string[] = []
	if (memory.tone) lines.push(`- Tone: ${memory.tone}`)
	if (memory.language) lines.push(`- Reply in ${memory.language} by default.`)
	if (memory.glossary?.length) {
		lines.push(`- Never translate or alter these terms: ${memory.glossary.join(', ')}`)
	}
	if (memory.notes) lines.push(`- Additional style notes: ${memory.notes}`)

	if (lines.length === 0) return ''
	return [
		'The user saved these writing preferences. Apply them to everything you',
		'write for them:',
		...lines,
	].join('\n')
}

const TOOL_GUIDANCE = [
	'You can operate the editor with the provided tools.',
	'This is a rich-text editor, NOT a LaTeX compiler. Document structure is',
	'always Markdown: # for headings, | … | for tables, - for lists.',
	'LaTeX is ONLY for the contents of a mathematical formula. Never emit',
	'\\documentclass, \\begin{document}, \\section, \\begin{tabular}, \\hline,',
	'\\textbf or a standalone .tex file - that arrives in the document as raw',
	'text with stray & and \\\\ characters.',
	'Prefer get_outline and read_section over guessing at a long document.',
	'When the user asks for something to be put into the document - a table, a',
	'section, a heading - call insert_content instead of writing it out in chat.',
	'Editing tools are queued for the writer to approve, so state plainly what',
	'you are proposing.',
].join(' ')

/**
 * Ubah stream OpenAI-compatible jadi event yang dimengerti klien.
 *
 * Bentuk aslinya (`choices[].delta.content`) tidak diteruskan mentah-mentah
 * supaya klien tidak terikat pada bentuk milik satu vendor - kalau providernya
 * berganti, yang menyesuaikan cukup berkas ini.
 */
/**
 * Sumber byte, dijelaskan lewat bentuknya saja.
 *
 * `fetch` di Node mengembalikan `ReadableStream` dari `stream/web`, yang secara
 * nominal berbeda dari `ReadableStream` global walau perilakunya sama. Menerima
 * bentuknya membuat berkas ini tidak perlu memihak salah satu deklarasi.
 */
interface ByteSource {
	getReader(): {
		read(): Promise<{ done: boolean; value?: Uint8Array }>
		releaseLock(): void
	}
}

/** Panggilan alat yang masih dirakit dari potongan delta. */
interface PartialToolCall {
	id: string
	name: string
	arguments: string
}

function toEventStream(body: ByteSource, toolsRejected = false): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder()
	const encoder = new TextEncoder()

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const reader = body.getReader()
			let buffer = ''

			/*
			 * Panggilan alat tiba berkeping seperti teks: nama datang di delta
			 * pertama, argumennya menyusul potongan demi potongan. Dikumpulkan per
			 * indeks dan baru dikirim setelah stream selesai - argumen JSON yang
			 * separuh jadi tidak bisa dipakai apa-apa.
			 */
			const pending = new Map<number, PartialToolCall>()

			const send = (event: ChatStreamEvent) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
			}

			if (toolsRejected) send({ type: 'tools_unsupported' })

			try {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					if (value) buffer += decoder.decode(value, { stream: true })

					// SSE dipisah per baris, tapi satu chunk bisa memuat potongan
					// baris - sisanya disimpan sampai barisnya utuh.
					const lines = buffer.split('\n')
					buffer = lines.pop() ?? ''

					for (const line of lines) {
						const trimmed = line.trim()
						if (!trimmed.startsWith('data:')) continue

						const payload = trimmed.slice(5).trim()
						if (payload === '[DONE]') continue

						try {
							const parsed = JSON.parse(payload)
							const delta = parsed?.choices?.[0]?.delta

							const text = delta?.content
							if (typeof text === 'string' && text.length > 0) send({ type: 'delta', text })

							for (const call of delta?.tool_calls ?? []) {
								const index: number = call.index ?? 0
								const current = pending.get(index) ?? { id: '', name: '', arguments: '' }

								if (call.id) current.id = call.id
								if (call.function?.name) current.name = call.function.name
								if (call.function?.arguments) current.arguments += call.function.arguments

								pending.set(index, current)
							}
						} catch {
							// Potongan tak terbaca dilewati: satu delta rusak tidak
							// sepadan dengan menggugurkan seluruh jawaban.
						}
					}
				}

				for (const call of pending.values()) {
					if (!call.name) continue
					send({
						type: 'tool_call',
						id: call.id || `call_${call.name}_${Math.random().toString(36).slice(2, 8)}`,
						name: call.name,
						arguments: call.arguments || '{}',
					})
				}

				send({ type: 'done' })
			} catch (error) {
				send({ type: 'error', message: error instanceof Error ? error.message : 'Stream terputus' })
			} finally {
				controller.close()
				reader.releaseLock()
			}
		},
	})
}
