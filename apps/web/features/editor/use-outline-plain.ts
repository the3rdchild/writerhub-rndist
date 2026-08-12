import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Baca kerangka dokumen tanpa React - supaya bisa dipakai NodeView blok TOC
 * dan util non-hook lain, bukan cuma `useOutline`.
 *
 * Sumber tunggal bersama `use-outline.ts`: kerangka sidebar dan isi blok TOC
 * tidak boleh berbeda, jadi `readOutlineItems` di sini adalah satu-satunya
 * pembacanya.
 */

export interface OutlineItem {
	pos: number
	level: number
	text: string
	/**
	 * 'heading' = bagian naskah (tingkat 1–6 default); 'caption' = tingkat 7–9
	 * yang dipakai sebagai kunci Daftar Gambar/Tabel (putusan repo
	 * heading-numbering). Dipakai A5 untuk menyaring jenis daftar isi.
	 */
	kind: 'heading' | 'caption'
}

/**
 * Daftar heading dokumen, diurutkan posisinya.
 *
 * Nomor bab adalah teks literal yang dibakar saat impor (lihat
 * heading-numbering), jadi cukup dipakai apa adanya - tidak ada nomor terhitung
 * terpisah.
 */
export function readOutlineItems(doc: PMNode): OutlineItem[] {
	const items: OutlineItem[] = []

	doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			const level = (node.attrs.level as number) ?? 1
			items.push({
				pos,
				level,
				text: node.textContent.trim(),
				// Tingkat 7–9 dialokasikan sebagai caption (Daftar Gambar/Tabel) -
				// bukan bagian naskah biasa. A5 memakainya untuk menyaring jenis daftar.
				kind: level >= 7 ? 'caption' : 'heading',
			})
			// Heading selalu blok tingkat atas pada skema ini, jadi tidak perlu
			// turun ke anak-anaknya - pemindaian ini berjalan pada tiap ketukan.
			return false
		}
		return true
	})

	return items
}
