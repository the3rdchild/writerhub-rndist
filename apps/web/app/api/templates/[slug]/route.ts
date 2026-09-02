import { callUpstream, configErrorResponse } from '@/lib/server/upstream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TemplateRouteProps {
	params: Promise<{ slug: string }>
}

export async function GET(_request: Request, { params }: TemplateRouteProps): Promise<Response> {
	try {
		const { slug } = await params
		return await callUpstream({
			path: `/api/v1/templates/${encodeURIComponent(slug)}`,
			method: 'GET',
		})
	} catch (error) {
		return configErrorResponse(error)
	}
}
