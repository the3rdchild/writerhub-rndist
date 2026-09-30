import type { TemplateCard, TemplateCategory, TemplateLocale, TemplateSummary } from '@writer-hub/shared'
import type { Template } from '@/db/schemas'

export type { TemplateCard, TemplateSummary }

/** Baris tabel menjadi bentuk kawat - dipakai daftar katalog maupun ambil per slug. */
export function toTemplate(row: Template): TemplateSummary {
	return {
		slug: row.slug,
		name: row.name,
		description: row.description,
		category: row.category as TemplateCategory,
		locale: row.locale as TemplateLocale,
		spec: row.spec,
		content: row.content,
	}
}

/** Bentuk ringan untuk kartu galeri: tanpa `spec`, dan hanya awal kerangkanya. */
export function toTemplateCard(row: Template): TemplateCard {
	return {
		slug: row.slug,
		name: row.name,
		description: row.description,
		category: row.category as TemplateCategory,
		locale: row.locale as TemplateLocale,
		pageSetup: row.spec.layout.pageSetup,
		preview: previewContent(row.content),
	}
}

/**
 * Anggaran potongan pratinjau. Kartu merender kerangka ke kotak satu halaman
 * dan menyembunyikan sisanya, jadi yang perlu dikirim hanya teks secukupnya
 * untuk memenuhi halaman itu. Satu halaman A4 pratinjau memuat kurang dari
 * 3.500 karakter.
 *
 * Batas bloknya longgar dengan sengaja. Halaman sampul akademik terdiri dari
 * puluhan baris pendek (Skripsi: 68 blok, 40 blok pertamanya hanya ±750
 * karakter), dan batas 40 blok sempat membuat kartunya berhenti di sepertiga
 * halaman. Katalog saat ini tidak ada yang terpotong; potongannya menjaga
 * template raksasa di masa depan.
 */
const PREVIEW_TEXT_CHARS = 3_500
const PREVIEW_MAX_BLOCKS = 120

/** Blok teratas kerangka sampai anggaran teks atau jumlah bloknya habis. */
export function previewContent(content: Record<string, unknown>): Record<string, unknown> {
	const blocks = Array.isArray(content.content) ? content.content : []
	const kept: unknown[] = []
	let chars = 0
	for (const block of blocks) {
		if (kept.length >= PREVIEW_MAX_BLOCKS || chars >= PREVIEW_TEXT_CHARS) break
		kept.push(block)
		chars += textLength(block)
	}
	return { ...content, content: kept }
}

function textLength(node: unknown): number {
	if (!node || typeof node !== 'object') return 0
	const { text, content } = node as { text?: unknown; content?: unknown }
	let total = typeof text === 'string' ? text.length : 0
	if (Array.isArray(content)) for (const child of content) total += textLength(child)
	return total
}
