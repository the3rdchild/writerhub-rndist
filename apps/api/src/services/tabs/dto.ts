import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'
import { z } from 'zod'

const pageMarginsSchema = z.object({
	top: z.number(),
	right: z.number(),
	bottom: z.number(),
	left: z.number(),
})

const pageSetupSchema = z.object({
	size: z.enum([
		'letter',
		'tabloid',
		'legal',
		'statement',
		'executive',
		'folio',
		'a3',
		'a4',
		'a5',
		'b4',
		'b5',
		'custom',
	]),
	customWidth: z.number().optional(),
	customHeight: z.number().optional(),
	orientation: z.enum(['portrait', 'landscape']),
	margins: pageMarginsSchema,
	pageColor: z.string().nullable(),
	pageless: z.boolean(),
})

const furnitureLineSchema = z.object({
	text: z.string().min(1),
	align: z.enum(['left', 'center', 'right']),
})

const furnitureSlotSchema = z.partialRecord(z.enum(['default', 'first', 'even']), furnitureLineSchema)

const pageFurnitureSchema = z.object({
	header: furnitureSlotSchema.optional(),
	footer: furnitureSlotSchema.optional(),
})

/** Tata letak utuh; dipakai `documents.layout`. */
export const tabLayoutSchema: z.ZodType<TabLayout> = z.object({
	pageSetup: pageSetupSchema,
	furniture: pageFurnitureSchema.optional(),
})

/** Penimpa per tab; dipakai `document_tabs.layout`. */
export const tabLayoutOverrideSchema: z.ZodType<TabLayoutOverride> = z.object({
	pageSetup: pageSetupSchema.optional(),
	furniture: pageFurnitureSchema.optional(),
})

export const createTabBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
	layout: tabLayoutOverrideSchema.nullish(),
})

export type CreateTabBody = z.infer<typeof createTabBodySchema>

export const updateTabBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
	layout: tabLayoutOverrideSchema.nullish(),
})

export type UpdateTabBody = z.infer<typeof updateTabBodySchema>

export const reorderTabsBodySchema = z.object({
	tabIds: z.array(z.uuid()).min(1),
})

export type ReorderTabsBody = z.infer<typeof reorderTabsBodySchema>

export interface TabSummary {
	id: string
	documentId: string
	title: string
	emoji: string | null
	language: string | null
	layout: TabLayoutOverride | null
	position: number
	updatedAt: number
	createdAt: number
}

export interface TabDetail extends TabSummary {
	content: Record<string, unknown>
}
