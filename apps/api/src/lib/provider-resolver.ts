import { AppError } from '@/lib/error'
import { getExtendedUserPackage } from '@/lib/pp-backend-client'
import { getServiceInfo, recordToolUsage } from '@/lib/pp-usage-client'

export interface ResolvedProvider {
	userId: string
	modelId: string | null
	alias: string | null
	isNineRouter: boolean
	baseUrl: string | null
	apiKey: string | null
	sdkProvider: 'openai' | 'anthropic'
	modelRecordId: number
}
export async function resolveProvider(bearerToken: string, serviceSlug: string): Promise<ResolvedProvider | null> {
	const userPackage = await getExtendedUserPackage(bearerToken)
	if (!userPackage) return null

	const serviceInfo = await getServiceInfo({
		userId: userPackage.user_id,
		name: userPackage.username,
		email: userPackage.user_email,
		categoryId: userPackage._id,
		serviceSlug,
	})
	if (!serviceInfo) return null

	const provider = serviceInfo.tools[0]?.providers[0]
	const connection = provider?.connections[0]
	if (!provider || !connection) return null

	return {
		userId: userPackage.user_id,
		modelId: provider.modelId,
		alias: provider.alias,
		isNineRouter: connection.isNineRouter,
		baseUrl: connection.baseUrl,
		apiKey: connection.apiKey,
		sdkProvider: provider.sdkProvider,
		modelRecordId: Number(provider.modelRecordId),
	}
}
export async function ensureToolQuota(userId: string, serviceSlug: string, toolName: string): Promise<void> {
	const result = await recordToolUsage({ userId, serviceSlug, toolName })
	if (result.ok) return

	if (result.reason === 'limit_exceeded') {
		throw AppError.tooManyRequests(result.message)
	}
}
