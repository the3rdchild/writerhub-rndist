import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ tabId: string; versionId: string }> },
): Promise<Response> {
	try {
		const { tabId, versionId } = await params
		return await callUpstream({
			path: `/api/v1/tabs/${encodeURIComponent(tabId)}/versions/${encodeURIComponent(versionId)}/restore`,
			method: 'POST',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
