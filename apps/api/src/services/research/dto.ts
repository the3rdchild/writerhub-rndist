import type { ResearchSource } from '@writer-hub/shared'
import { z } from 'zod'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Batas satu panggilan alat `fetch_url`, bukan batas Tavily (yang 20). */
export const MAX_EXTRACT_URLS = 5

export const researchSearchSchema = z.object({
	query: z.string().min(2).max(400),
	topic: z.enum(['general', 'news']).optional(),
	language: z.string().max(10).optional(),
	startDate: z.string().regex(ISO_DATE, 'Tanggal harus YYYY-MM-DD').optional(),
	endDate: z.string().regex(ISO_DATE, 'Tanggal harus YYYY-MM-DD').optional(),
	maxResults: z.coerce.number().int().min(1).max(20).optional(),
	tabId: z.uuid().optional(),
})

export const researchExtractSchema = z.object({
	urls: z.array(z.url()).min(1).max(MAX_EXTRACT_URLS),
	query: z.string().max(400).optional(),
	topic: z.enum(['general', 'news']).optional(),
	tabId: z.uuid().optional(),
})

export type ResearchSearchBody = z.infer<typeof researchSearchSchema>
export type ResearchExtractBody = z.infer<typeof researchExtractSchema>

/** Yang dikembalikan ke browser: `text` masuk ke pesan tool apa adanya. */
export interface ResearchToolResponse {
	text: string
	sources: ResearchSource[]
	credits: number
}
