import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan pembacaan daftar proyek milik user ke apps/api. */
export async function GET(): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/projects',
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

/** Teruskan pembuatan proyek baru ke apps/api. */
export async function POST(request: Request): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/projects',
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
