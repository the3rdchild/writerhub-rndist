import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan submit grammar check (multipart: text/file/title/model) ke apps/api. */
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
