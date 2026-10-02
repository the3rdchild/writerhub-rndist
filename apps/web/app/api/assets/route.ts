import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/*
 * Rute BFF aset. Klien (`features/assets/api.ts`) memanggil `/api/assets`
 * sejak panel Aset dibuat, tetapi rutenya tidak pernah ada - panel itu selalu
 * berakhir "Request gagal (404)" (uji editor 2 Okt, OBJ-3).
 */
export async function GET(request: Request): Promise<Response> {
	try {
		const { search } = new URL(request.url)
		return await callUpstream({ path: `/api/v1/assets${search}`, method: 'GET' })
	} catch (error) {
		return configErrorResponse(error)
	}
}

export async function POST(request: Request): Promise<Response> {
	try {
		return await callUpstream({ path: '/api/v1/assets', method: 'POST', body: await request.formData() })
	} catch (error) {
		return configErrorResponse(error)
	}
}
