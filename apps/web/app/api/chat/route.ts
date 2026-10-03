import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(request: Request): Promise<Response> {
	try {
		const upstream = await callUpstream({
			path: '/api/v1/chat',
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
			stream: true,
			signal: request.signal,
		})

		if (!upstream.ok || !upstream.body) {
			const detail = await upstream.text().catch(() => '')
			const retryAfter = upstream.headers.get('retry-after')
			return Response.json(
				{
					message: 'Could not start the conversation',
					errors: upstreamErrors(detail, upstream.status),
				},
				{ status: upstream.status || 502, headers: retryAfter ? { 'retry-after': retryAfter } : undefined },
			)
		}

		return new Response(upstream.body, {
			headers: {
				'content-type': 'text/event-stream; charset=utf-8',
				'cache-control': 'no-cache, no-transform',
				connection: 'keep-alive',
				'x-accel-buffering': 'no',
			},
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

/**
 * Pesan galat dari badan jawaban API. API membalas `{ message, errors }`, dan
 * meneruskannya sebagai teks mentah membuat panel chat menampilkan JSON
 * (misalnya jawaban 429 batas laju).
 */
function upstreamErrors(detail: string, status: number): string[] {
	try {
		const body = JSON.parse(detail) as { message?: unknown; errors?: unknown }
		if (
			Array.isArray(body.errors) &&
			body.errors.every((item) => typeof item === 'string') &&
			body.errors.length
		) {
			return body.errors
		}
		if (typeof body.message === 'string' && body.message) return [body.message]
	} catch {}
	return [detail || `Upstream responded with ${status}`]
}
