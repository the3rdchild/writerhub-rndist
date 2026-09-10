import type { DocumentMetadata, TemplateMetadataField } from '@writer-hub/shared'

/**
 * Mengganti teks contoh di kerangka template dengan metadata yang diisi
 * pengguna, sekali saja - saat dokumen lahir.
 *
 * Sesudah itu sampulnya naskah biasa: mengubah judul di metadata TIDAK
 * mengubah sampul yang sudah tertulis. Itu pilihan sadar, bukan kelalaian -
 * field hidup yang selalu sinkron menuntut tipe node tersendiri beserta
 * penanganannya di ekspor DOCX dan PDF. Konsekuensinya dinyatakan di formulir
 * yang mengisinya, bukan disimpan sebagai kejutan.
 *
 * Pencocokannya literal dan hanya di simpul teks: struktur dokumen, tanda
 * format, dan atribut node tidak pernah tersentuh. Nilai kosong dilewati -
 * pengguna yang melewatkan satu isian mendapat teks contoh aslinya, yang masih
 * memberi tahu apa yang seharusnya ditulis di sana.
 */
export function applyTemplateMetadata(
	content: Record<string, unknown>,
	fields: readonly TemplateMetadataField[] | undefined,
	metadata: DocumentMetadata | undefined,
): Record<string, unknown> {
	const replacements = usableReplacements(fields, metadata)
	if (replacements.length === 0) return content
	return substitute(content, replacements) as Record<string, unknown>
}

interface Replacement {
	from: string
	to: string
}

function usableReplacements(
	fields: readonly TemplateMetadataField[] | undefined,
	metadata: DocumentMetadata | undefined,
): Replacement[] {
	if (!fields?.length || !metadata) return []

	const replacements: Replacement[] = []
	for (const field of fields) {
		const value = metadata[field.key]?.trim()
		if (!value || !field.placeholder) continue
		replacements.push({ from: field.placeholder, to: value })
	}

	/*
	 * Yang panjang didahulukan. Tanpa ini, sebuah teks contoh yang kebetulan
	 * awalan dari teks contoh lain - "Judul" sebelum "Judul Skripsi" - akan
	 * memakan sebagiannya lebih dulu dan menyisakan potongan.
	 */
	return replacements.sort((a, b) => b.from.length - a.from.length)
}

function substitute(node: unknown, replacements: readonly Replacement[]): unknown {
	if (Array.isArray(node)) return node.map((child) => substitute(child, replacements))
	if (!node || typeof node !== 'object') return node

	const source = node as Record<string, unknown>
	const next: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(source)) {
		if (key === 'text' && typeof value === 'string') {
			next[key] = replaceAll(value, replacements)
			continue
		}
		next[key] = substitute(value, replacements)
	}
	return next
}

function replaceAll(text: string, replacements: readonly Replacement[]): string {
	let result = text
	for (const { from, to } of replacements) {
		result = result.split(from).join(to)
	}
	return result
}
