import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan pemulihan dokumen ke versi lampau ke apps/api. */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<Response> {
	try {
		const { id, versionId } = await params
		return await callUpstream({
			path: `/api/v1/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`,
			method: 'POST',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
