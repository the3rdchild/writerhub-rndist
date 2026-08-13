/** Lifecycle job async (grammar & analysis) - dari submit sampai hasil siap. */

export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

/** Balasan 202 saat job berhasil di-enqueue. */
export interface JobSubmission {
	jobId: string
	statusURL: string
}

/**
 * Event yang dikirim API lewat SSE `/api/v1/stream/:jobId`.
 * `checkpoint` cuma dipakai job grammar (hasil parsial per checker).
 */
export type JobStreamEvent<TDone> =
	| ({ type: 'done' } & TDone)
	| { type: 'error'; message: string }
	| { type: 'timeout' }
	| { type: 'ping' }
