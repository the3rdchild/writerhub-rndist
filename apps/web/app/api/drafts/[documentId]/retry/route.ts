import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Menulis ulang draf yang gagal. Tidak berbadan permintaan: prompt aslinya
 * tersimpan di sisi API, karena halaman ini tidak pernah melihatnya.
 */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
	try {
		const { documentId } = await params
		return await callUpstream({
			path: `/api/v1/drafts/${encodeURIComponent(documentId)}/retry`,
			method: 'POST',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
