export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export interface JobSubmission {
	jobId: string
	statusURL: string
}

export type JobStreamEvent<TDone> =
	| ({ type: 'done' } & TDone)
	| { type: 'error'; message: string }
	| { type: 'timeout' }
	| { type: 'ping' }
