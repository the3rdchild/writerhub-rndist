import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Tautan dokumen saat ini (`?documentId=`), atau null bila belum dibagikan. */
export async function GET(request: Request): Promise<Response> {
	try {
		const { search } = new URL(request.url)
		return await callUpstream({ path: `/api/v1/shares${search}`, method: 'GET' })
	} catch (error) {
		return configErrorResponse(error)
	}
}

export async function POST(request: Request): Promise<Response> {
	try {
		return await callUpstream({
			path: '/api/v1/shares',
			method: 'POST',
			body: await request.text(),
			contentType: 'application/json',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
