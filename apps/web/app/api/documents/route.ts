import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
	try {
		const { search } = new URL(request.url)
		return await callUpstream({
			path: `/api/v1/documents${search}`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

export async function POST(request: Request): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/documents',
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
