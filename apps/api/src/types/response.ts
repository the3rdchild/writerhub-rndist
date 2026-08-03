/**
 * Bentuk respons HTTP hidup di packages/shared supaya apps/web memakai
 * definisi yang sama persis. Re-export di sini menjaga import lama tetap jalan.
 */
export type { ErrorResponse, Pagination, SuccessResponse } from '@writer-hub/shared'
