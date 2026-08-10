import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan pembacaan satu tab (beserta naskahnya) ke apps/api. */
export async function GET(_request: Request, { params }: { params: Promise<{ tabId: string }> }): Promise<Response> {
	try {
		const { tabId } = await params
		return await callUpstream({
			path: `/api/v1/tabs/${encodeURIComponent(tabId)}`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

/** Teruskan pembaruan tab (autosave konten) ke apps/api. */
export async function PUT(request: Request, { params }: { params: Promise<{ tabId: string }> }): Promise<Response> {
	try {
		const { tabId } = await params
		return await callUpstream({
			path: `/api/v1/tabs/${encodeURIComponent(tabId)}`,
			method: 'PUT',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

/** Teruskan penghapusan tab ke apps/api. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ tabId: string }> }): Promise<Response> {
	try {
		const { tabId } = await params
		return await callUpstream({
			path: `/api/v1/tabs/${encodeURIComponent(tabId)}`,
			method: 'DELETE',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
