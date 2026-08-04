import type {
	GrammarJobStatus,
	GrammarModel,
	GrammarResultPayload,
	GrammarStreamEvent,
	JobSubmission,
} from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'
import { streamJob } from '@/lib/sse'

export interface GrammarCheckInput {
	text: string
	file: File | null
	title: string
	model: GrammarModel
	/** Bahasa naskah; worker memakainya agar AI tidak berpindah bahasa. */
	language: string
}

/** Antrekan job grammar check. Mengembalikan jobId untuk dipantau lewat SSE. */
export async function submitGrammarCheck(input: GrammarCheckInput): Promise<JobSubmission> {
	const form = new FormData()
	if (input.file) form.append('file', input.file)
	else form.append('text', input.text)
	if (input.title) form.append('title', input.title)
	form.append('model', input.model)
	form.append('language', input.language)

	return apiFetch<JobSubmission>('/grammar', { method: 'POST', body: form })
}

export function fetchGrammarJobStatus(jobId: string): Promise<GrammarJobStatus> {
	return apiFetch<GrammarJobStatus>(`/status/${encodeURIComponent(jobId)}`)
}

/** Batas tunggu per mode - jalur AI jauh lebih lama dari pemeriksaan lokal. */
export function streamTimeoutFor(model: GrammarModel): number {
	return model === 'standard' ? 60_000 : 180_000
}

export interface StreamGrammarOptions {
	/** Hasil parsial per checker, supaya suggestion muncul bertahap. */
	onCheckpoint?: (event: Extract<GrammarStreamEvent, { type: 'checkpoint' }>) => void
	timeoutMs?: number
	signal?: AbortSignal
}

/** Ikuti job sampai selesai dan kembalikan hasil akhirnya. */
export async function streamGrammarCheck(
	jobId: string,
	{ onCheckpoint, timeoutMs, signal }: StreamGrammarOptions = {},
): Promise<GrammarResultPayload> {
	const event = await streamJob<GrammarStreamEvent>(jobId, {
		timeoutMs,
		signal,
		isTerminal: (e) => e.type === 'done' || e.type === 'error' || e.type === 'timeout',
		onEvent: (e) => {
			if (e.type === 'checkpoint') onCheckpoint?.(e)
		},
	})

	if (event.type === 'error') throw new Error(event.message || 'Pengecekan gagal')
	if (event.type !== 'done') throw new Error('Timeout menunggu hasil, coba lagi')

	const { type: _type, ...result } = event
	return result
}
