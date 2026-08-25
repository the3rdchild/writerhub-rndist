import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const { id } = await params
		return await callUpstream({
			path: `/api/v1/documents/${encodeURIComponent(id)}/tabs/reorder`,
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
