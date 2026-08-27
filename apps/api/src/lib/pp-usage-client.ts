import { env } from '@/config/env'
import { signPpHmacRequest } from '@/lib/pp-signature'
import LoggerClient from '@/lib/logger'

const log = LoggerClient.getInstance()

const SERVICE_INFO_PATH = '/api/info'
const USAGE_TOOL_PATH = '/api/usage/tool'
const USAGE_TOKEN_PATH = '/api/usage/token'

export interface PeriodLimit {
	usage: number
	limit: number
}

export interface PeriodLimits {
	five_hour: PeriodLimit | null
	daily: PeriodLimit | null
	weekly: PeriodLimit | null
	monthly: PeriodLimit | null
}

export interface ServiceLimit {
	name: string
	slug: string
	limit: number
	usage: number
	period: 'five_hour' | 'daily' | 'weekly' | 'monthly'
}

export interface ServiceProviderConnection {
	name: string
	baseUrl: string | null
	apiKey: string | null
	isNineRouter: boolean
}

export interface ServiceProvider {
	modelRecordId: string
	model: string
	modelId: string | null
	alias: string | null
	sdkProvider: 'openai' | 'anthropic'
	limits: PeriodLimits
	connections: ServiceProviderConnection[]
}

export interface ServiceTool {
	name: string
	limits: PeriodLimits
	providers: ServiceProvider[]
}

export interface ServiceInfo {
	limits: ServiceLimit[]
	tools: ServiceTool[]
}

async function postSigned(
	path: string,
	payload: Record<string, unknown>,
): Promise<{ ok: true; res: Response } | { ok: false; status: number | null; body: string }> {
	const body = JSON.stringify(payload)
	const { signature, timestamp } = signPpHmacRequest('POST', path, body)

	try {
		const res = await fetch(`${env.PP_EXTENDED_ADMIN_URL}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-signature': signature,
				'x-timestamp': timestamp,
			},
			body,
		})

		if (res.ok) return { ok: true, res }
		return { ok: false, status: res.status, body: await res.text().catch(() => '') }
	} catch (err) {
		log.error({ err, path }, '[pp-usage-client] request error')
		return { ok: false, status: null, body: '' }
	}
}

export interface ServiceInfoParams {
	userId: string
	name: string
	email: string
	categoryId: string
	serviceSlug: string
}

export async function getServiceInfo(params: ServiceInfoParams): Promise<ServiceInfo | null> {
	if (!env.PP_EXTENDED_ADMIN_URL) {
		log.warn('[pp-usage-client] PP_EXTENDED_ADMIN_URL belum dikonfigurasi, lewati getServiceInfo')
		return null
	}

	const result = await postSigned(SERVICE_INFO_PATH, {
		userId: params.userId,
		name: params.name,
		email: params.email,
		serviceSlug: params.serviceSlug,
		categoryId: params.categoryId,
	})

	if (!result.ok) {
		log.warn({ status: result.status }, '[pp-usage-client] getServiceInfo gagal')
		return null
	}

	const json = (await result.res.json()) as { data: ServiceInfo; message: string }
	return json.data ?? null
}

export interface RecordToolUsageParams {
	userId: string
	serviceSlug: string
	toolName: string
	count?: number
}

export type ToolUsageResult =
	| { ok: true }
	| { ok: false; reason: 'limit_exceeded'; message: string }
	| { ok: false; reason: 'error' }

export async function recordToolUsage(params: RecordToolUsageParams): Promise<ToolUsageResult> {
	if (!env.PP_EXTENDED_ADMIN_URL) {
		log.warn('[pp-usage-client] PP_EXTENDED_ADMIN_URL belum dikonfigurasi, lewati recordToolUsage')
		return { ok: false, reason: 'error' }
	}

	const result = await postSigned(USAGE_TOOL_PATH, {
		userId: params.userId,
		serviceSlug: params.serviceSlug,
		toolName: params.toolName,
		count: params.count ?? 1,
	})

	if (result.ok) return { ok: true }

	log.warn(
		{ toolName: params.toolName, status: result.status, body: result.body },
		'[pp-usage-client] recordToolUsage gagal',
	)

	if (result.status === 429) {
		let message = 'Kuota pemakaian Anda sudah habis.'
		try {
			const parsed = JSON.parse(result.body) as { message?: string; errors?: string[] }
			message = parsed.errors?.[0] ?? parsed.message ?? message
		} catch {}
		return { ok: false, reason: 'limit_exceeded', message }
	}

	return { ok: false, reason: 'error' }
}

export interface RecordTokenUsageParams {
	userId: string
	serviceSlug: string
	modelRecordId: number
	token: number
}

export async function recordTokenUsage(params: RecordTokenUsageParams): Promise<boolean> {
	if (!env.PP_EXTENDED_ADMIN_URL) {
		log.warn('[pp-usage-client] PP_EXTENDED_ADMIN_URL belum dikonfigurasi, lewati recordTokenUsage')
		return false
	}

	const result = await postSigned(USAGE_TOKEN_PATH, {
		userId: params.userId,
		serviceSlug: params.serviceSlug,
		modelRecordId: params.modelRecordId,
		token: params.token,
	})

	if (!result.ok) {
		log.warn({ status: result.status, body: result.body }, '[pp-usage-client] recordTokenUsage gagal')
		return false
	}
	return true
}
