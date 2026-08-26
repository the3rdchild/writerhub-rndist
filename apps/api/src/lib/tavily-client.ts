import { env } from '@/config/env'
import { AppError } from '@/lib/error'
import LoggerClient from '@/utils/logger'

const log = LoggerClient.getInstance()

const SEARCH_URL = 'https://api.tavily.com/search'
const EXTRACT_URL = 'https://api.tavily.com/extract'

const SEARCH_TIMEOUT_MS = 20_000
const EXTRACT_TIMEOUT_MS = 45_000

/** Batas Tavily: 20 URL per permintaan /extract. */
const EXTRACT_URL_LIMIT = 20
/** Satu kredit menanggung 5 ekstraksi yang berhasil. */
const EXTRACT_URLS_PER_CREDIT = 5

export type ResearchTopic = 'general' | 'news'
export type ResearchTimeRange = 'day' | 'week' | 'month' | 'year'

export interface TavilySource {
	url: string
	title: string
	snippet: string
	score: number
	publishedAt: string | null
	favicon: string | null
}

export interface TavilySearchResult {
	query: string
	topic: ResearchTopic
	sources: TavilySource[]
	credits: number
}

export interface TavilyPage {
	url: string
	content: string
	favicon: string | null
}

export interface TavilyExtractResult {
	pages: TavilyPage[]
	failed: { url: string; error: string }[]
	credits: number
}

export interface TavilySearchInput {
	query: string
	topic?: ResearchTopic
	/** ISO 639-1, biasanya bahasa dokumen aktif. Kosong = tanpa penyaringan bahasa. */
	language?: string
	country?: string
	timeRange?: ResearchTimeRange
	startDate?: string
	endDate?: string
	maxResults?: number
	excludeDomains?: string[]
}

interface TavilySearchResponse {
	results?: {
		url?: string
		title?: string
		content?: string
		score?: number
		published_date?: string
		favicon?: string
	}[]
	usage?: { credits?: number }
}

interface TavilyExtractResponse {
	results?: { url?: string; raw_content?: string; favicon?: string }[]
	failed_results?: { url?: string; error?: string }[]
	usage?: { credits?: number }
}

/**
 * Mencari lewat Tavily. Konten penuh sengaja tidak diminta di sini
 * (`include_raw_content: false`) supaya biaya menempel pada halaman yang
 * benar-benar dibaca lewat `extract`.
 *
 * `search_depth` dipatok `basic` (1 kredit). Kalau hasilnya nol, satu kali
 * ulang dengan `advanced` (2 kredit) - tidak lebih dari sekali.
 */
export async function search(input: TavilySearchInput): Promise<TavilySearchResult> {
	const topic = input.topic ?? 'general'
	const first = await runSearch(input, topic, 'basic')
	if (first.sources.length > 0) return first

	const retry = await runSearch(input, topic, 'advanced')
	return { ...retry, credits: first.credits + retry.credits }
}

async function runSearch(
	input: TavilySearchInput,
	topic: ResearchTopic,
	depth: 'basic' | 'advanced',
): Promise<TavilySearchResult> {
	const body: Record<string, unknown> = {
		query: input.query,
		topic,
		search_depth: depth,
		max_results: input.maxResults ?? env.RESEARCH_MAX_RESULTS,
		include_raw_content: false,
		include_answer: false,
		include_favicon: true,
		include_usage: true,
	}

	if (input.language) {
		body.language = input.language
		body.filter_by_language = true
	}
	if (input.country) body.country = input.country
	if (input.timeRange) body.time_range = input.timeRange
	if (input.startDate) body.start_date = input.startDate
	if (input.endDate) body.end_date = input.endDate
	if (input.excludeDomains?.length) body.exclude_domains = input.excludeDomains

	const payload = await post<TavilySearchResponse>(SEARCH_URL, body, SEARCH_TIMEOUT_MS)
	const sources = (payload.results ?? [])
		.filter((row): row is { url: string } & typeof row => Boolean(row.url))
		.map((row) => ({
			url: row.url,
			title: row.title?.trim() || row.url,
			snippet: row.content?.trim() ?? '',
			score: typeof row.score === 'number' ? row.score : 0,
			publishedAt: row.published_date ?? null,
			favicon: row.favicon ?? null,
		}))

	return {
		query: input.query,
		topic,
		sources,
		credits: payload.usage?.credits ?? (depth === 'advanced' ? 2 : 1),
	}
}

/**
 * Mengambil isi halaman lewat Tavily, bukan lewat proksi sendiri - jadi API ini
 * tidak pernah melakukan request keluar ke URL arbitrer, dan seluruh pengaman
 * SSRF tidak diperlukan. Lihat `docs/WEB-RESEARCH-PLAN.md`.
 */
export async function extract(urls: string[], query?: string): Promise<TavilyExtractResult> {
	const wanted = urls.slice(0, EXTRACT_URL_LIMIT)
	if (wanted.length === 0) return { pages: [], failed: [], credits: 0 }

	const body: Record<string, unknown> = {
		urls: wanted,
		extract_depth: 'basic',
		format: 'markdown',
		include_favicon: true,
		include_usage: true,
	}
	if (query) body.query = query

	const payload = await post<TavilyExtractResponse>(EXTRACT_URL, body, EXTRACT_TIMEOUT_MS)
	const pages = (payload.results ?? [])
		.filter((row) => Boolean(row.url))
		.map((row) => ({
			url: row.url as string,
			content: row.raw_content?.trim() ?? '',
			favicon: row.favicon ?? null,
		}))

	const failed = (payload.failed_results ?? []).map((row) => ({
		url: row.url ?? '',
		error: row.error ?? 'Tidak diketahui',
	}))

	return {
		pages,
		failed,
		credits: payload.usage?.credits ?? Math.ceil(pages.length / EXTRACT_URLS_PER_CREDIT),
	}
}

async function post<T>(url: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
	if (!env.TAVILY_API_KEY) {
		throw new AppError(503, 'Riset web belum dikonfigurasi - TAVILY_API_KEY kosong.')
	}

	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${env.TAVILY_API_KEY}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		})
	} catch (err) {
		log.error({ err, url }, '[tavily] request gagal')
		throw new AppError(504, 'Penyedia riset web tidak merespons.')
	}

	if (!response.ok) throw toAppError(response.status, await response.text().catch(() => ''))
	return (await response.json()) as T
}

function toAppError(status: number, detail: string): AppError {
	if (status === 401 || status === 403) {
		log.error({ status, detail }, '[tavily] kredensial ditolak')
		return new AppError(503, 'Kunci API riset web ditolak penyedia.')
	}
	if (status === 429) return AppError.tooManyRequests('Kuota riset web penyedia habis.')
	if (status === 432 || status === 433) {
		return AppError.tooManyRequests('Kredit Tavily habis.')
	}
	if (status >= 500) return new AppError(503, 'Penyedia riset web sedang bermasalah.')

	log.warn({ status, detail }, '[tavily] permintaan ditolak')
	return AppError.badRequest(`Permintaan riset web ditolak penyedia (${status}).`)
}
