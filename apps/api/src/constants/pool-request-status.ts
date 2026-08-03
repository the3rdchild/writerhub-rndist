import { JOB_STATUSES } from '@writer-hub/shared'

/** Nilai enum kolom `pool_request.status` — identik dengan JobStatus di shared. */
export const POOL_REQUEST_STATUS = JOB_STATUSES

export type { JobStatus as PoolRequestStatus } from '@writer-hub/shared'
