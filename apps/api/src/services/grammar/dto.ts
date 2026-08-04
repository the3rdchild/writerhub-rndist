import { GRAMMAR_MODELS } from '@writer-hub/shared'
import { z } from 'zod'
import { isAllowedMime } from '@/constants/mime'

export const MAX_TEXT_LENGTH = 50_000
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

const documentFileSchema = z
	.instanceof(File)
	.refine((f) => isAllowedMime(f.type), { message: 'Only PDF, DOCX, or TXT files are allowed' })
	.refine((f) => f.size <= MAX_FILE_SIZE_BYTES, { message: 'File size must not exceed 10MB' })

export const grammarBodySchema = z
	.object({
		text: z
			.string()
			.trim()
			.min(1, 'Text cannot be empty')
			.max(MAX_TEXT_LENGTH, `Text is too long (max ${MAX_TEXT_LENGTH.toLocaleString('en-US')} characters)`)
			.optional(),
		file: documentFileSchema.optional(),
		title: z.string().trim().max(255).optional(),
		model: z.enum(GRAMMAR_MODELS).optional().default('standard'),
		language: z.string().trim().min(2).max(12).optional(),
	})
	.refine((data) => data.text || data.file, {
		message: 'Either text or a file is required',
	})

export type GrammarBody = z.infer<typeof grammarBodySchema>
