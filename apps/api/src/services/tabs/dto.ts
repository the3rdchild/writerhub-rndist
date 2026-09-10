import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'
import { z } from 'zod'

const pageMarginsSchema = z.object({
	top: z.number(),
	right: z.number(),
	bottom: z.number(),
	left: z.number(),
})

/*
 * Watermark ikut divalidasi di sini, dan itu WAJIB: `z.object` membuang kunci
 * yang tidak dikenalnya, jadi bidang yang tidak disebut akan hilang diam-diam
 * saat tab disinkron - tersimpan di peramban, lenyap di peladen, dan karena
 * muatan ekspor dibangun dari baris peladen, watermarknya tidak akan pernah
 * sampai ke PDF.
 */
const watermarkSchema = z.object({
	kind: z.enum(['text', 'image']),
	text: z.string().optional(),
	assetId: z.string().optional(),
	anchor: z.enum([
		'center',
		'top-left',
		'top',
		'top-right',
		'left',
		'right',
		'bottom-left',
		'bottom',
		'bottom-right',
		'tile',
	]),
	bleed: z.boolean().optional(),
	offsetX: z.number(),
	offsetY: z.number(),
	scale: z.number(),
	opacity: z.number(),
	rotation: z.number(),
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
	watermark: watermarkSchema.optional(),
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
