import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
	try {
		const { jobId } = await params
		return await callUpstream({
			path: `/api/v1/history/${encodeURIComponent(jobId)}`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
	try {
		const { jobId } = await params
		return await callUpstream({
			path: `/api/v1/history/${encodeURIComponent(jobId)}`,
			method: 'DELETE',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
