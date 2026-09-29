import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { ACADEMIC_NUMBERING, FIRST_CHAPTER_TITLE, FRONT_MATTER, type PageNumbering } from '@writer-hub/shared'
import { PAGE_BREAK_NODE } from './page-break'
import { SECTION_BREAK_NODE } from './section-break'

/**
 * Penomoran halaman karya ilmiah menurut pedoman umum kampus Indonesia:
 *
 * - sampul dihitung i tapi tanpa nomor;
 * - bagian depan (pengesahan, kata pengantar, abstrak, daftar isi) romawi
 *   kecil di tengah bawah;
 * - mulai BAB I angka dari 1: halaman pembuka bab di tengah bawah, halaman
 *   lainnya di kanan atas, sampai akhir naskah.
 *
 * Dibangun dari bahan yang sudah ada - pemisah bagian dan aturan penomoran
 * per bagian - jadi DOCX-nya pun dua section Word dengan pgNumType masing-
 * masing, dan penulis bisa mengubahnya lewat dialog penomoran seperti biasa.
 */

export const FRONT_NUMBERING: PageNumbering = ACADEMIC_NUMBERING.front

export const BODY_NUMBERING: PageNumbering = ACADEMIC_NUMBERING.body

const COVER_LABELS = new Set(Object.values(FRONT_MATTER).map((spec) => spec.label))

/** Posisi judul BAB I di tingkat teratas naskah, atau `null` bila belum ada. */
export function firstChapterPos(doc: PMNode): number | null {
	let found: number | null = null
	doc.forEach((node, offset) => {
		if (found !== null || node.type.name !== 'heading' || Number(node.attrs.level) !== 1) return
		if (FIRST_CHAPTER_TITLE.test(node.textContent.replace(/\s+/g, ' ').trim())) found = offset
	})
	return found
}

/** Ada isi sungguhan sebelum BAB I - bukan hanya paragraf kosong dan pemenggal. */
export function hasFrontMatter(doc: PMNode, until: number): boolean {
	let found = false
	doc.forEach((node, offset) => {
		if (found || offset >= until) return
		if (node.type.name === PAGE_BREAK_NODE || node.type.name === SECTION_BREAK_NODE) return
		if (node.textContent.trim() || node.isAtom) found = true
	})
	return found
}

/** Naskah dibuka sampul baku ("SKRIPSI", "TESIS"...) - halaman pertamanya tanpa nomor. */
export function opensWithCover(doc: PMNode): boolean {
	return COVER_LABELS.has(doc.firstChild?.textContent.trim() ?? '')
}

export type AcademicNumberingPlacement =
	| { ok: true; front: boolean; cover: boolean }
	| { ok: false; reason: 'no-chapter' }

/**
 * Aturan penomoran berlaku mulai judul di `at`: lewat pemisah bagian tepat di
 * depannya. Pemisah bagian yang sudah ada di sana dipakai ulang - tata
 * letaknya tetap; pemenggal halaman yang ada di sana digantikan, karena
 * pemisah bagian sudah membuka lembar baru dan keduanya berurutan menjadi
 * halaman kosong.
 */
export function placeSectionNumbering(
	tr: Transaction,
	schema: Schema,
	at: number,
	numbering: PageNumbering,
): void {
	const before = tr.doc.resolve(at).nodeBefore
	if (before?.type.name === SECTION_BREAK_NODE) {
		tr.setNodeMarkup(at - before.nodeSize, undefined, {
			...before.attrs,
			continuous: false,
			pageSetup: { ...((before.attrs.pageSetup as object | null) ?? {}), pageNumbering: numbering },
		})
		return
	}
	const node = schema.nodes[SECTION_BREAK_NODE].create({
		pageSetup: { pageNumbering: numbering },
		columns: null,
		continuous: false,
	})
	if (before?.type.name === PAGE_BREAK_NODE) tr.replaceWith(at - before.nodeSize, at, node)
	else tr.insert(at, node)
}

/**
 * Menaruh aturan badan naskah tepat di depan BAB I, di dalam `tr`. Aturan
 * bagian depan (tab) dan sampul tanpa nomor dipasang pemanggil: keduanya
 * hidup di luar naskah. Naskah tanpa bagian depan tidak mendapat pemisah -
 * seluruhnya badan naskah.
 */
export function placeAcademicNumbering(tr: Transaction, schema: Schema): AcademicNumberingPlacement {
	const at = firstChapterPos(tr.doc)
	if (at === null) return { ok: false, reason: 'no-chapter' }
	const cover = opensWithCover(tr.doc)
	if (!hasFrontMatter(tr.doc, at)) return { ok: true, front: false, cover }
	placeSectionNumbering(tr, schema, at, BODY_NUMBERING)
	return { ok: true, front: true, cover }
}

/**
 * Penomoran tab ini sudah diatur - oleh pemasangan otomatis sebelumnya, oleh
 * penulis, atau oleh template? Yang sudah diatur tidak ditimpa.
 */
export function numberingCustomized(doc: PMNode, tabNumbering: PageNumbering | undefined): boolean {
	if (
		tabNumbering &&
		(tabNumbering.format !== 'decimal' || tabNumbering.position || tabNumbering.openingPosition)
	) {
		return true
	}
	let custom = false
	doc.forEach((node) => {
		if (
			node.type.name === SECTION_BREAK_NODE &&
			(node.attrs.pageSetup as { pageNumbering?: unknown } | null)?.pageNumbering
		) {
			custom = true
		}
	})
	return custom
}
