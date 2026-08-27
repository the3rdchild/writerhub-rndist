import { isTerminalEvent, subscribeToJob } from '@/lib/job-events'
import { recordTokenUsage } from '@/lib/pp-usage-client'
import { findPoolRequest } from '@/repository/job-result'
import LoggerClient from '@/lib/logger'

const DEFAULT_TIMEOUT_MS = 5 * 60_000

const log = LoggerClient.getInstance()

interface JobCompletion {
	status: 'completed' | 'failed' | 'timeout'
	totalTokens: number | null
	modelRecordId: number | null
}

async function readCompletion(jobId: string): Promise<JobCompletion | null> {
	const row = await findPoolRequest(jobId)
	if (row?.status !== 'completed' && row?.status !== 'failed') return null
	return { status: row.status, totalTokens: row.total_tokens, modelRecordId: row.model_record_id }
}

async function waitForCompletion(jobId: string, timeoutMs: number): Promise<JobCompletion> {
	const already = await readCompletion(jobId)
	if (already) return already

	const timedOut: JobCompletion = { status: 'timeout', totalTokens: null, modelRecordId: null }

	return new Promise<JobCompletion>((resolve) => {
		let settled = false
		let unsubscribe = () => {}

		const finish = async (event: 'terminal' | 'timeout') => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			unsubscribe()
			resolve(event === 'timeout' ? timedOut : ((await readCompletion(jobId)) ?? timedOut))
		}

		const timer = setTimeout(() => void finish('timeout'), timeoutMs)

		subscribeToJob(jobId, (raw) => {
			try {
				if (isTerminalEvent(JSON.parse(raw) as { type?: string })) void finish('terminal')
			} catch {
				log.debug({ jobId, raw }, '[job-usage-wait] payload bukan JSON valid, diabaikan')
			}
		})
			.then((cleanup) => {
				if (settled) cleanup()
				else unsubscribe = cleanup
			})
			.catch(() => void finish('timeout'))
	})
}

export interface RecordTokenUsageAfterCompletionParams {
	jobId: string
	userId: string | undefined
	serviceSlug: string
	timeoutMs?: number
}

export function recordTokenUsageAfterCompletion({
	jobId,
	userId,
	serviceSlug,
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: RecordTokenUsageAfterCompletionParams): void {
	if (!userId) return

	void waitForCompletion(jobId, timeoutMs)
		.then(({ status, totalTokens, modelRecordId }) => {
			if (status === 'timeout') {
				log.warn({ jobId }, '[job-usage-wait] timeout menunggu job selesai')
				return
			}
			if (status !== 'completed' || !totalTokens || !modelRecordId) return

			return recordTokenUsage({ userId, serviceSlug, modelRecordId, token: totalTokens }).then(
				() => undefined,
			)
		})
		.catch((err) => log.error({ jobId, err }, '[job-usage-wait] pencatatan token usage gagal'))
}
