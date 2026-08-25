import 'server-only'

import { createHmac } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { AUTH_HEADERS, type ApiClient } from '@writer-hub/shared'
const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const API_CLIENT = (process.env.API_CLIENT ?? 'pp-extended') as ApiClient
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'pp_token'
const AUTH_MODE = process.env.AUTH_MODE === 'none' ? 'none' : 'pp'

export class UpstreamConfigError extends Error {}

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) throw new UpstreamConfigError(`${name} belum dikonfigurasi di apps/web`)
	return value
}
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
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
	body?: BodyInit | null
	contentType?: string | null
	stream?: boolean
	signal?: AbortSignal
}
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
		duplex: body ? 'half' : undefined,
	})
}
export function configErrorResponse(error: unknown): Response {
	const message =
		error instanceof UpstreamConfigError ? error.message : 'Gagal menghubungi layanan API'
	return Response.json({ message: 'Konfigurasi server tidak lengkap', errors: [message] }, { status: 500 })
}
