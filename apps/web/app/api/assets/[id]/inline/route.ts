import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Byte aset lewat sesi pengguna - dipakai "Insert" di panel Aset (OBJ-3). */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	try {
		const { id } = await params
		return await callUpstream({ path: `/api/v1/assets/${encodeURIComponent(id)}/inline`, method: 'GET' })
	} catch (error) {
		return configErrorResponse(error)
	}
}
