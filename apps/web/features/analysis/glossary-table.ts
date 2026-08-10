import type { GlossaryEntry } from '@writer-hub/shared'
import type { JSONContent } from '@tiptap/core'

/** Judul bagian yang disisipkan; juga penanda saat menggantinya nanti. */
export const GLOSSARY_HEADING = 'Glosarium'

const cell = (text: string, header = false): JSONContent => ({
	type: header ? 'tableHeader' : 'tableCell',
	content: [
		text
			? { type: 'paragraph', content: [{ type: 'text', text }] }
			: { type: 'paragraph' },
	],
})

/**
 * Label kolom Istilah: singkatan beserta kepanjangannya dalam kurung.
 *
 * Kepanjangan digabung ke sini, bukan jadi kolom sendiri, supaya tabel tetap
 * dua kolom - dan supaya istilah yang memang bukan singkatan tidak menyisakan
 * sel kosong di tiap barisnya.
 */
export function glossaryTermLabel(entry: GlossaryEntry): string {
	const expansion = entry.expansion?.trim()
	return expansion ? `${entry.term} (${expansion})` : entry.term
}

/**
 * Rakit bagian Glosarium: satu heading diikuti tabel dua kolom.
 *
 * Fungsi murni - menerima entri, mengembalikan node ProseMirror - supaya
 * bentuk keluarannya bisa diuji tanpa editor sungguhan.
 */
export function buildGlossarySection(entries: readonly GlossaryEntry[]): JSONContent[] {
	return [
		{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: GLOSSARY_HEADING }] },
		{
			type: 'table',
			content: [
				{ type: 'tableRow', content: [cell('Istilah', true), cell('Definisi', true)] },
				...entries.map((entry) => ({
					type: 'tableRow',
					content: [cell(glossaryTermLabel(entry)), cell(entry.definition)],
				})),
			],
		},
	]
}

/**
 * Cari bagian Glosarium yang sudah ada di naskah.
 *
 * Yang dianggap milik fitur ini: heading apa pun yang teksnya persis
 * "Glosarium" DAN diikuti langsung oleh sebuah tabel. Syarat kedua itu yang
 * menjaga kita dari menimpa tulisan pengguna - heading "Glosarium" yang diikuti
 * paragraf biasa adalah karangannya sendiri, bukan tabel buatan kita.
 *
 * Mengembalikan rentang posisi ProseMirror `[from, to)` yang mencakup heading
 * beserta tabelnya, atau null bila tidak ada.
 */
export function findGlossarySection(doc: {
	childCount: number
	child: (index: number) => { type: { name: string }; textContent: string; nodeSize: number }
	content: { size: number }
}): { from: number; to: number } | null {
	let pos = 0

	for (let i = 0; i < doc.childCount; i++) {
		const node = doc.child(i)
		const isHeading = node.type.name === 'heading'
		const matches = node.textContent.trim() === GLOSSARY_HEADING

		if (isHeading && matches && i + 1 < doc.childCount) {
			const next = doc.child(i + 1)
			if (next.type.name === 'table') {
				return { from: pos, to: pos + node.nodeSize + next.nodeSize }
			}
		}

		pos += node.nodeSize
	}

	return null
}
