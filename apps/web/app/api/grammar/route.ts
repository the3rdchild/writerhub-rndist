import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/grammar',
			method: 'POST',
			body: await request.formData(),
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
