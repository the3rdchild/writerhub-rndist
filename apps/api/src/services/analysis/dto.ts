import { ANALYSIS_FEATURES } from '@writer-hub/shared'
import { z } from 'zod'
import { MAX_TEXT_LENGTH } from '@/services/grammar/dto'

export const MIN_ANALYSIS_TEXT_LENGTH = 10

export const analysisBodySchema = z.object({
	feature: z.enum(ANALYSIS_FEATURES),
	text: z
		.string()
		.trim()
		.min(MIN_ANALYSIS_TEXT_LENGTH, `Text is too short (min ${MIN_ANALYSIS_TEXT_LENGTH} characters)`)
		.max(MAX_TEXT_LENGTH, `Text is too long (max ${MAX_TEXT_LENGTH.toLocaleString('en-US')} characters)`),
	/** Bahasa naskah; worker memakainya agar AI menjawab dalam bahasa yang sama. */
	language: z.string().trim().min(2).max(12).optional(),
	/** Tautan ke tab cloud untuk Aktivitas AI; tab lokal mengirim tanpa ini. */
	tabId: z.uuid().optional(),
	/** Alias usang untuk `tabId` (id dokumen lama = id tab setelah migrasi 0009). */
	documentId: z.uuid().optional(),
})

export type AnalysisBody = z.infer<typeof analysisBodySchema>

export { ANALYSIS_FEATURES }
