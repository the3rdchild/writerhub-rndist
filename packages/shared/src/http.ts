export interface Pagination {
	page: number
	limit: number
	total: number
	totalPages: number
	hasNextPage: boolean
	hasPreviousPage: boolean
}

export interface SuccessResponse<T> {
	message: string
	data?: T
	pagination?: Pagination
	description?: string
}

export interface ErrorResponse {
	message: string
	errors: string[]
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse
export const API_CLIENTS = ['pp-extended', 'ransel-ai', 'another-client'] as const
export type ApiClient = (typeof API_CLIENTS)[number]

export const AUTH_HEADERS = {
	client: 'x-client',
	ppApiKey: 'x-pp-api-key',
	ppTimestamp: 'x-pp-timestamp',
	ppUserId: 'x-pp-user-id',
	ranselAiApiKey: 'x-ransel-ai-api-key',
	apiKey: 'x-api-key',
} as const
