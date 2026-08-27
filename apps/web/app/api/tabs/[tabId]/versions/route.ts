import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ tabId: string }> },
): Promise<Response> {
	try {
		const { tabId } = await params
		return await callUpstream({
			path: `/api/v1/tabs/${encodeURIComponent(tabId)}/versions`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ tabId: string }> },
): Promise<Response> {
	try {
		const { tabId } = await params
		return await callUpstream({
			path: `/api/v1/tabs/${encodeURIComponent(tabId)}/versions`,
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
