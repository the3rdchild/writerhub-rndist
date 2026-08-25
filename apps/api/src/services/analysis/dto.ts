import { ANALYSIS_FEATURES, REWRITE_TONE_IDS } from '@writer-hub/shared'
import { z } from 'zod'
import { MAX_TEXT_LENGTH } from '@/services/grammar/dto'

export const MIN_ANALYSIS_TEXT_LENGTH = 10

export const analysisBodySchema = z
	.object({
		feature: z.enum(ANALYSIS_FEATURES),
		text: z
			.string()
			.trim()
			.min(MIN_ANALYSIS_TEXT_LENGTH, `Text is too short (min ${MIN_ANALYSIS_TEXT_LENGTH} characters)`)
			.max(MAX_TEXT_LENGTH, `Text is too long (max ${MAX_TEXT_LENGTH.toLocaleString('en-US')} characters)`),
		language: z.string().trim().min(2).max(12).optional(),
		tabId: z.uuid().optional(),
		documentId: z.uuid().optional(),
		tone: z.enum(REWRITE_TONE_IDS).optional(),
		targetLang: z.string().trim().min(2).max(12).optional(),
	})
	.refine((data) => !data.tone || data.feature === 'ai_rewriter', {
		message: 'tone hanya berlaku untuk fitur ai_rewriter',
	})
	.refine((data) => data.feature !== 'translator' || Boolean(data.targetLang), {
		message: 'targetLang wajib diisi untuk fitur translator',
	})
	.refine((data) => !data.targetLang || data.feature === 'translator', {
		message: 'targetLang hanya berlaku untuk fitur translator',
	})

export type AnalysisBody = z.infer<typeof analysisBodySchema>

export { ANALYSIS_FEATURES }
