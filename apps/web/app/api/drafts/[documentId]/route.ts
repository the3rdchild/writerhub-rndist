import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
	try {
		const { documentId } = await params
		return await callUpstream({ path: `/api/v1/drafts/${encodeURIComponent(documentId)}` })
	} catch (error) {
		return configErrorResponse(error)
	}
}
