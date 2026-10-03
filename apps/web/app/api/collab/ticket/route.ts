import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Tiket websocket kolaborasi real-time (docs/collab-realtime.md).
 *
 * Peramban tidak bisa memanggil API dengan tanda tangan server, dan websocket
 * tidak membawa header buatan. Jadi izinnya diperiksa di sini lewat jalur
 * biasa (bertanda tangan + token pengguna), dan API menjawab dengan tiket
 * berumur pendek yang dibawa peramban sendiri ke websocket API.
 *
 * Dengan `shareToken`, aksesnya lewat tautan berbagi dan perannya mengikuti
 * tautan itu (viewer hanya menerima).
 */
export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json().catch(() => null)) as { tabId?: unknown; shareToken?: unknown } | null
		const tabId = typeof body?.tabId === 'string' ? body.tabId : ''
		const shareToken = typeof body?.shareToken === 'string' ? body.shareToken : ''
		if (!tabId) {
			return Response.json({ message: 'Bad Request', errors: ['tabId is required'] }, { status: 400 })
		}

		return await callUpstream({
			path: shareToken
				? `/api/v1/collab/shared/${encodeURIComponent(shareToken)}/tickets`
				: '/api/v1/collab/tickets',
			method: 'POST',
			body: JSON.stringify({ tabId }),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
