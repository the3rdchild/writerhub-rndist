import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
	try {
		const { search } = new URL(request.url)
		return await callUpstream({
			path: `/api/v1/templates${search}`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
