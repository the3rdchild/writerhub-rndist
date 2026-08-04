import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Polling status job - dipakai sebagai cadangan kalau SSE terputus. */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
	try {
		const { jobId } = await params
		return await callUpstream({ path: `/api/v1/status/${encodeURIComponent(jobId)}` })
	} catch (error) {
		return configErrorResponse(error)
	}
}
