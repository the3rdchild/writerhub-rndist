import type {
	AnalysisFeature,
	AnalysisResultFor,
	AnalysisStreamEvent,
	JobSubmission,
} from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'
import { streamJob } from '@/lib/sse'

const ANALYSIS_TIMEOUT_MS = 120_000

/** Submit job analisis lalu tunggu hasilnya lewat SSE. */
export async function runAnalysis<F extends AnalysisFeature>(
	feature: F,
	text: string,
	signal?: AbortSignal,
): Promise<AnalysisResultFor<F>> {
	const { jobId } = await apiFetch<JobSubmission>('/analyze', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ feature, text }),
		signal,
	})

	const event = await streamJob<AnalysisStreamEvent<F>>(jobId, {
		signal,
		timeoutMs: ANALYSIS_TIMEOUT_MS,
		isTerminal: (e) => e.type === 'done' || e.type === 'error' || e.type === 'timeout',
	})

	if (event.type === 'error') throw new Error(event.message || 'Analisis gagal')
	if (event.type !== 'done') throw new Error('Timeout menunggu hasil, coba lagi')

	return event.result
}
