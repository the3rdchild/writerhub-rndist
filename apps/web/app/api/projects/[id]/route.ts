import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const { id } = await params
		return await callUpstream({
			path: `/api/v1/projects/${encodeURIComponent(id)}`,
			method: 'PUT',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const { id } = await params
		return await callUpstream({
			path: `/api/v1/projects/${encodeURIComponent(id)}`,
			method: 'DELETE',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
