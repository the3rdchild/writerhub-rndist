import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
	try {
		const { jobId } = await params
		return await callUpstream({ path: `/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, method: 'POST' })
	} catch (error) {
		return configErrorResponse(error)
	}
}
