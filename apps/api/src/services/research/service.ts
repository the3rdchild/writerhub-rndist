import type { ResearchResultPayload, ResearchSource } from '@writer-hub/shared'
import { env, isLocalAuth } from '@/config/env'
import { USAGE_SERVICE_SLUG } from '@/constants/usage'
import { AppError } from '@/lib/error'
import LoggerClient from '@/lib/logger'
import { ensureToolQuota } from '@/lib/provider-resolver'
import { readPage, readSearch, writePage, writeSearch } from '@/lib/research-cache'
import { extract, search, type TavilyPage } from '@/lib/tavily-client'
import { findTabById } from '@/repository/document-tab'
import { recordResearchActivity } from '@/repository/research-activity'
import BaseService from '@/services/base.service'
import {
	type ResearchExtractBody,
	type ResearchSearchBody,
	type ResearchToolResponse,
	researchExtractSchema,
	researchSearchSchema,
} from './dto'
import { extractToolText, failureText, searchToolText } from './tool-text'

const log = LoggerClient.getInstance()

const SNIPPET_CHARS = 240

export default class ResearchService extends BaseService {
	async search(): Promise<Response> {
		try {
			const body = researchSearchSchema.safeParse(await this.context.req.json().catch(() => ({})))
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			this.assertEnabled()
			const data = await this.runSearch(body.data)
			return this.success({ data })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	async extract(): Promise<Response> {
		try {
			const body = researchExtractSchema.safeParse(await this.context.req.json().catch(() => ({})))
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			this.assertEnabled()
			const data = await this.runExtract(body.data)
			return this.success({ data })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private async runSearch(input: ResearchSearchBody): Promise<ResearchToolResponse> {
		const topic = input.topic ?? 'general'
		const denied = deniedDomains()
		const query = {
			query: input.query,
			topic,
			language: input.language,
			startDate: input.startDate,
			endDate: input.endDate,
			maxResults: input.maxResults,
			excludeDomains: denied,
		}

		const cached = await readSearch(query)
		if (!cached) await this.chargeQuota('web_search')

		const result = cached ?? (await search(query))
		if (!cached) await writeSearch(query, result)

		const now = Date.now()
		const sources: ResearchSource[] = result.sources
			.filter((source) => !isDenied(source.url, denied))
			.map((source) => ({ ...source, extracted: false, fetchedAt: now }))

		// Hit cache bukan riset baru: mencatatnya lagi hanya menggandakan baris
		// di Aktivitas untuk pekerjaan yang sudah ada entrinya.
		if (!cached) {
			await this.record(input.tabId, {
				query: input.query,
				topic,
				language: input.language ?? null,
				sources,
				credits: result.credits,
			})
		}

		return {
			text: searchToolText(input.query, sources),
			sources,
			credits: cached ? 0 : result.credits,
		}
	}

	private async runExtract(input: ResearchExtractBody): Promise<ResearchToolResponse> {
		const topic = input.topic ?? 'general'
		const denied = deniedDomains()

		const allowed = input.urls.filter((url) => !isDenied(url, denied))
		if (allowed.length === 0) {
			throw AppError.badRequest('Semua URL yang diminta ada di daftar tolak.')
		}

		const cachedPages: TavilyPage[] = []
		const missing: string[] = []
		for (const url of allowed) {
			const hit = await readPage(url)
			if (hit) cachedPages.push(hit)
			else missing.push(url)
		}

		let fetched: TavilyPage[] = []
		let failed: { url: string; error: string }[] = []
		let credits = 0

		if (missing.length > 0) {
			await this.chargeQuota('fetch_url')
			const result = await extract(missing, input.query)
			fetched = result.pages
			failed = result.failed
			credits = result.credits
			for (const page of fetched) await writePage(page, topic)
		}

		const pages = [...cachedPages, ...fetched]
		const now = Date.now()
		const sources: ResearchSource[] = pages.map((page) => ({
			url: page.url,
			title: hostOf(page.url),
			snippet: page.content.slice(0, SNIPPET_CHARS),
			score: 0,
			publishedAt: null,
			favicon: page.favicon,
			extracted: true,
			fetchedAt: now,
		}))

		if (sources.length > 0 && missing.length > 0) {
			await this.record(input.tabId, {
				query: input.query ?? allowed.join(', '),
				topic,
				language: null,
				sources,
				credits,
			})
		}

		return {
			text: `${extractToolText(pages, env.RESEARCH_RESULT_CHARS)}${failureText(failed)}`,
			sources,
			credits,
		}
	}

	private assertEnabled(): void {
		if (!env.RESEARCH_ENABLED) {
			throw new AppError(503, 'Riset web sedang dimatikan administrator.')
		}
	}

	/**
	 * Kuota dicatat dengan nama alat sendiri, tapi tetap di bawah slug layanan
	 * yang sama dengan fitur lain - admin-ppe hanya mengenal satu slug per
	 * layanan. Kalau admin-ppe belum mengenal nama alatnya, `ensureToolQuota`
	 * diam saja: hanya `limit_exceeded` yang melempar.
	 */
	private async chargeQuota(toolName: string): Promise<void> {
		if (isLocalAuth) return

		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('Butuh autentikasi untuk memakai riset web.')
		await ensureToolQuota(userId, USAGE_SERVICE_SLUG, toolName)
	}

	private async record(tabId: string | undefined, result: ResearchResultPayload): Promise<void> {
		const userId = this.context.get('userId') ?? null
		try {
			await recordResearchActivity({
				userId,
				tabId: await this.ownedTabId(tabId),
				result,
			})
		} catch (error) {
			// Riwayat gagal ditulis tidak boleh menjatuhkan hasil riset yang sudah dibayar.
			log.warn({ error }, '[research] gagal mencatat aktivitas')
		}
	}

	private async ownedTabId(tabId: string | undefined): Promise<string | null> {
		if (!tabId) return null
		try {
			const tab = await findTabById(tabId, await this.identityId())
			return tab?.id ?? null
		} catch {
			return null
		}
	}
}

function deniedDomains(): string[] {
	return env.RESEARCH_DENY_DOMAINS.split(',')
		.map((domain) => domain.trim().toLowerCase())
		.filter(Boolean)
}

function isDenied(url: string, denied: string[]): boolean {
	if (denied.length === 0) return false
	const host = hostOf(url)
	return denied.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
	} catch {
		return url
	}
}
