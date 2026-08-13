'use client'

import type { Editor } from '@tiptap/react'
import { pageBlockRange, pageOfPos, paginationKey } from './pagination'

/**
 * Menerjemahkan cakupan yang dipahami penulis ("halaman ini") jadi rentang
 * posisi dokumen yang bisa dikurung pembatas section (§P8&P9).
 *
 * Berdiri sebagai modul sendiri karena dua pemanggil yang sangat berbeda
 * membutuhkannya: dialog Penyiapan halaman dan alat AI. Menyalin logikanya ke
 * keduanya berarti "halaman ini" bisa berarti dua hal berbeda tergantung dari
 * mana ia diminta - persis jenis perbedaan yang tidak akan pernah ada yang
 * menyadarinya sampai sebuah dokumen rusak.
 *
 * Ia tidak boleh hidup di `section-break.ts`: berkas itu diimpor paginasi, dan
 * di sini kita justru membaca hasil paginasi.
 */

export type SectionScope = 'from_here' | 'this_page'

export const SECTION_SCOPES: readonly SectionScope[] = ['from_here', 'this_page']

export function isSectionScope(value: unknown): value is SectionScope {
	return value === 'from_here' || value === 'this_page'
}

/**
 * Rentang yang akan dikurung. `to` tidak ada berarti "sampai akhir naskah",
 * jadi tidak ada pembatas penutup yang perlu disisipkan.
 *
 * Mengembalikan null bila cakupannya tidak bisa ditentukan: kursor belum
 * pernah ditaruh, atau paginasi belum sempat mengukur (mode pageless tidak
 * punya halaman sama sekali).
 */
export function sectionRange(
	editor: Editor,
	scope: SectionScope,
): { from: number; to?: number } | null {
	if (editor.isDestroyed) return null
	const { doc, selection } = editor.state

	if (scope === 'from_here') {
		// Pembatas section adalah blok tersendiri, jadi ia harus mendarat di antara
		// blok - bukan di tengah paragraf tempat kursor kebetulan berada.
		const depth = selection.$from.depth === 0 ? 0 : 1
		return { from: selection.$from.before(depth || undefined) }
	}

	const pagination = paginationKey.getState(editor.state)
	if (!pagination) return null

	const page = pageOfPos(pagination.blockPages, selection.from)
	if (page === null) return null

	return pageBlockRange(pagination.blockPages, page, doc.content.size)
}
