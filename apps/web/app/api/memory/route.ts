import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan pembacaan AI Memory milik user ke apps/api. */
export async function GET(): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/memory',
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

/** Teruskan penyimpanan AI Memory (upsert, satu objek per user) ke apps/api. */
export async function PUT(request: Request): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/memory',
			method: 'PUT',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
