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
			return Response.json(
				{
					message: 'Gagal memulai percakapan',
					errors: [detail || `Upstream membalas ${upstream.status}`],
				},
				{ status: upstream.status || 502 },
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
