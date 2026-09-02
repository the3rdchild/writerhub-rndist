import type { DocNode, ProseMirrorDoc } from '@/services/drafts/markdown-doc'

/**
 * Pembatas section pembawa kolom di dalam konten dokumen.
 *
 * Kolom bukan bagian dari `documents.layout`: di editor ia hidup sebagai
 * atribut node `sectionBreak` (`apps/web/features/editor/section-break.ts`),
 * jadi satu-satunya cara sebuah naskah keluar berkolom adalah node itu benar-
 * benar ada di dalam kontennya. Konsekuensinya, setiap penulisan ulang isi tab
 * harus menyisipkannya kembali - naskah yang ditimpa apa adanya akan kehilangan
 * kolomnya tanpa jejak.
 */

export interface SectionColumns {
	count: number
	gap?: number
}

/**
 * Bentuknya sama persis dengan yang ditulis perintah `setSectionColumns` di
 * editor: menerus (tidak memaksa halaman baru) dan tanpa perubahan geometri,
 * supaya section sesudahnya mewarisi kertas dan margin yang sedang berlaku.
 */
export function columnBreak(columns: SectionColumns): DocNode {
	return { type: 'sectionBreak', attrs: { pageSetup: null, columns, continuous: true } }
}

function headingText(node: DocNode): string | null {
	if (node.type !== 'heading') return null
	return (node.content ?? [])
		.map((child) => child.text ?? '')
		.join('')
		.trim()
}

function withBreakAt(doc: ProseMirrorDoc, at: number, columns: SectionColumns): ProseMirrorDoc {
	return {
		type: 'doc',
		content: [...doc.content.slice(0, at), columnBreak(columns), ...doc.content.slice(at)],
	}
}

/**
 * Menyisipkan pembatas tepat sebelum heading bernama - dipakai kerangka
 * template, yang judul bagiannya sudah diketahui saat definisi ditulis.
 * Mengembalikan null bila headingnya tidak ada, supaya pemanggil yang tahu
 * template mana yang salah menyusun pesan galatnya.
 */
export function withColumnsBefore(
	doc: ProseMirrorDoc,
	heading: string,
	columns: SectionColumns,
): ProseMirrorDoc | null {
	const at = doc.content.findIndex((node) => headingText(node) === heading)
	return at === -1 ? null : withBreakAt(doc, at, columns)
}

/**
 * Menyisipkan pembatas sesudah judul dokumen - dipakai naskah hasil generasi,
 * yang judul bagiannya baru diketahui sesudah model menulisnya. Judul dibiarkan
 * selebar halaman dan sisanya mengalir berkolom, sesuai bentuk paper dua kolom.
 * Naskah yang tidak dibuka heading mendapat pembatasnya di awal.
 */
export function withColumnsAfterTitle(doc: ProseMirrorDoc, columns: SectionColumns): ProseMirrorDoc {
	return withBreakAt(doc, doc.content[0]?.type === 'heading' ? 1 : 0, columns)
}
