import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teruskan pembacaan daftar versi satu dokumen ke apps/api. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const { id } = await params
		return await callUpstream({
			path: `/api/v1/documents/${encodeURIComponent(id)}/versions`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}

/** Teruskan pembuatan versi manual (snapshot berlabel) ke apps/api. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
	try {
		const { id } = await params
		return await callUpstream({
			path: `/api/v1/documents/${encodeURIComponent(id)}/versions`,
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
