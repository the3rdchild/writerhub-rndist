import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
	try {
		const { jobId } = await params
		const upstream = await callUpstream({
			path: `/api/v1/stream/${encodeURIComponent(jobId)}`,
			stream: true,
			signal: request.signal,
		})

		if (!upstream.ok || !upstream.body) {
			return Response.json(
				{ message: 'Gagal membuka stream', errors: [`Upstream membalas ${upstream.status}`] },
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
