import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/analyze',
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
