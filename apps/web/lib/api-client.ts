import type { ErrorResponse, SuccessResponse } from '@writer-hub/shared'

/**
 * Browser selalu memanggil route handler Next di same-origin `/api/*`;
 * handler itulah yang menandatangani dan meneruskan ke apps/api
 * (lihat lib/server/upstream.ts). Tidak ada base URL yang perlu dikonfigurasi.
 */
const BASE_PATH = '/api'

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message)
		this.name = 'ApiError'
	}
}

function messageFromBody(body: Partial<ErrorResponse>, status: number): string {
	return body.errors?.join(', ') || body.message || `Request gagal (${status})`
}

/** Kirim request dan bongkar envelope `{ message, data }` jadi `data`. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${BASE_PATH}${path}`, init)
	const body = (await response.json().catch(() => ({}))) as SuccessResponse<T> & Partial<ErrorResponse>

	if (!response.ok) {
		throw new ApiError(messageFromBody(body, response.status), response.status)
	}
	if (body.data === undefined) {
		throw new ApiError('Respons tanpa data', response.status)
	}
	return body.data
}

/**
 * Minta server membatalkan job (§P7 lapis B). Fire-and-forget: UI sudah bebas
 * lewat AbortController (lapis A); panggilan ini hanya berusaha membebaskan
 * worker. Galat ditelan - kegagalan pembatalan server tidak boleh mengganggu
 * pengguna yang sudah melihat UI-nya bebas.
 */
export function cancelJob(jobId: string): void {
	apiFetch(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }).catch(() => {
		/* best effort - lihat komentar di atas */
	})
}
