import { createHash } from 'node:crypto'
import type { ResearchTopic } from '@writer-hub/shared'
import { env } from '@/config/env'
import redis from '@/config/redis'
import LoggerClient from '@/lib/logger'
import type { TavilyExtractResult, TavilySearchInput, TavilySearchResult } from '@/lib/tavily-client'

const log = LoggerClient.getInstance()

const PREFIX = 'research'

/**
 * Berita basi jauh lebih cepat daripada halaman umum, jadi TTL-nya dipisah.
 * Keduanya diatur lewat env supaya bisa dikencangkan tanpa deploy ulang kode.
 */
function ttlFor(topic: ResearchTopic): number {
	return topic === 'news' ? env.RESEARCH_CACHE_TTL_NEWS : env.RESEARCH_CACHE_TTL_GENERAL
}

function fingerprint(parts: (string | number | undefined)[]): string {
	return createHash('sha1')
		.update(parts.map((part) => part ?? '').join('|'))
		.digest('hex')
}

export function searchKey(input: TavilySearchInput): string {
	return `${PREFIX}:search:${fingerprint([
		input.query.trim().toLowerCase(),
		input.topic ?? 'general',
		input.language,
		input.country,
		input.timeRange,
		input.startDate,
		input.endDate,
		input.maxResults ?? env.RESEARCH_MAX_RESULTS,
		input.excludeDomains?.slice().sort().join(','),
	])}`
}

export function extractKey(url: string): string {
	return `${PREFIX}:extract:${fingerprint([url.trim()])}`
}

/**
 * Cache tidak boleh pernah menjatuhkan riset: Redis mati berarti cache miss,
 * bukan galat.
 */
async function read<T>(key: string): Promise<T | null> {
	try {
		const raw = await redis.get(key)
		return raw ? (JSON.parse(raw) as T) : null
	} catch (err) {
		log.warn({ err, key }, '[research-cache] gagal membaca')
		return null
	}
}

async function write(key: string, value: unknown, ttlSeconds: number): Promise<void> {
	try {
		await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
	} catch (err) {
		log.warn({ err, key }, '[research-cache] gagal menulis')
	}
}

export function readSearch(input: TavilySearchInput): Promise<TavilySearchResult | null> {
	return read<TavilySearchResult>(searchKey(input))
}

export function writeSearch(input: TavilySearchInput, result: TavilySearchResult): Promise<void> {
	return write(searchKey(input), result, ttlFor(result.topic))
}

export function readPage(url: string): Promise<TavilyExtractResult['pages'][number] | null> {
	return read<TavilyExtractResult['pages'][number]>(extractKey(url))
}

export function writePage(page: TavilyExtractResult['pages'][number], topic: ResearchTopic): Promise<void> {
	return write(extractKey(page.url), page, ttlFor(topic))
}
