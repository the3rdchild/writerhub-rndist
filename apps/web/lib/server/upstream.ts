import 'server-only'

import { createHmac } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { AUTH_HEADERS, type ApiClient } from '@writer-hub/shared'

/**
 * Jembatan ke apps/api.
 *
 * Endpoint API dilindungi tanda tangan HMAC (`x-pp-api-key` = HMAC-SHA256 dari
 * timestamp memakai PP_API_KEY). Secret itu tidak boleh sampai ke browser,
 * jadi browser hanya bicara ke route handler Next di /api/* dan modul inilah
 * yang menambahkan kredensial sebelum meneruskan ke apps/api.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const API_CLIENT = (process.env.API_CLIENT ?? 'pp-extended') as ApiClient
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'pp_token'

/**
 * `none` untuk pengembangan lokal: apps/api berjalan dengan AUTH_MODE=none,
 * jadi tidak ada yang perlu ditandatangani dan tidak ada secret yang perlu
 * dikonfigurasi. Harus disetel ke `pp` (bawaan) untuk produksi.
 */
const AUTH_MODE = process.env.AUTH_MODE === 'none' ? 'none' : 'pp'

export class UpstreamConfigError extends Error {}

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) throw new UpstreamConfigError(`${name} belum dikonfigurasi di apps/web`)
	return value
}

/**
 * Token user diambil dari header Authorization kalau WritingHub disematkan di
 * dalam shell yang sudah meneruskannya; kalau berdiri sendiri, dari cookie sesi.
 */
async function resolveBearerToken(): Promise<string | null> {
	const incoming = (await headers()).get('authorization')
	if (incoming?.startsWith('Bearer ')) return incoming.slice(7).trim()

	const cookie = (await cookies()).get(AUTH_COOKIE_NAME)?.value
	return cookie ?? null
}

async function buildAuthHeaders(): Promise<Headers> {
	if (AUTH_MODE === 'none') return new Headers()

	const result = new Headers({ [AUTH_HEADERS.client]: API_CLIENT })

	if (API_CLIENT === 'pp-extended') {
		const timestamp = Date.now().toString()
		const signature = createHmac('sha256', requireEnv('PP_API_KEY')).update(timestamp).digest('hex')
		result.set(AUTH_HEADERS.ppApiKey, signature)
		result.set(AUTH_HEADERS.ppTimestamp, timestamp)

		const token = await resolveBearerToken()
		if (token) result.set('authorization', `Bearer ${token}`)
	} else if (API_CLIENT === 'ransel-ai') {
		result.set(AUTH_HEADERS.ranselAiApiKey, requireEnv('RANSEL_AI_API_KEY'))
	} else {
		result.set(AUTH_HEADERS.apiKey, requireEnv('API_KEY'))
	}

	return result
}

export interface UpstreamRequest {
	path: string
	method?: 'GET' | 'POST'
	body?: BodyInit | null
	contentType?: string | null
	/** SSE perlu koneksi yang tidak di-buffer dan tidak di-cache. */
	stream?: boolean
	signal?: AbortSignal
}

/** Teruskan sebuah request ke apps/api dengan kredensial yang sudah lengkap. */
export async function callUpstream({
	path,
	method = 'GET',
	body = null,
	contentType,
	stream = false,
	signal,
}: UpstreamRequest): Promise<Response> {
	const requestHeaders = await buildAuthHeaders()
	if (contentType) requestHeaders.set('content-type', contentType)
	if (stream) requestHeaders.set('accept', 'text/event-stream')

	return fetch(`${API_URL}${path}`, {
		method,
		headers: requestHeaders,
		body,
		cache: 'no-store',
		signal,
		// @ts-expect-error - opsi Node/undici, belum ada di tipe RequestInit standar
		duplex: body ? 'half' : undefined,
	})
}

/** Ubah kegagalan konfigurasi jadi respons JSON yang bentuknya sama dengan API. */
export function configErrorResponse(error: unknown): Response {
	const message =
		error instanceof UpstreamConfigError ? error.message : 'Gagal menghubungi layanan API'
	return Response.json({ message: 'Konfigurasi server tidak lengkap', errors: [message] }, { status: 500 })
}
