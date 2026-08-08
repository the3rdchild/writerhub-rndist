import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan pembacaan satu versi (beserta naskahnya) ke apps/api. */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<Response> {
	try {
		const { id, versionId } = await params
		return await callUpstream({
			path: `/api/v1/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
