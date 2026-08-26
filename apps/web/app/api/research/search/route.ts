import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/research/search',
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
			signal: request.signal,
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
