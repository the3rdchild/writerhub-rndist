import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan pembacaan share link ke apps/api. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
	try {
		const { token } = await params
		return await callUpstream({
			path: `/api/v1/shares/${encodeURIComponent(token)}`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
