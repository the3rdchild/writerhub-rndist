import { diffWordsWithSpace } from 'diff'
import type { JSONContent } from '@tiptap/core'
import { buildTextIndex } from '@/features/document/tiptap-offsets'
import { buildSchema } from '@/features/sync/serialize'

/**
 * Diff word-level antara versi lampau dan draf aktif (§3.2 rencana).
 *
 * Kedua sisi diubah ke teks polos lewat jalur yang sama (`buildTextIndex`)
 * yang nanti dipakai plugin dekorasi untuk memetakan offset kembali ke posisi
 * ProseMirror, jadi sorotan tidak pernah bergeser karena selisih satu `\n`.
 *
 * Hasilnya berkoordinat teks versi terpilih: potongan `removed` punya rentang
 * di sana, sedangkan potongan `added` (teks yang hanya ada di draf) tidak -
 * ia hanya punya titik sisip, dan dirender sebagai marker widget.
 */

export interface VersionDiffRange {
	/** Offset di dalam teks polos versi terpilih. */
	offset: number
	/** Panjang rentang di teks versi; selalu 0 untuk `added`. */
	length: number
	kind: 'added' | 'removed'
	/** Kata-kata yang ditambahkan di draf (hanya `added`; untuk tooltip marker). */
	words?: string
}

/** Teks polos sebuah naskah JSON, satu baris per blok teks, dipisah `\n`. */
export function versionPlainText(json: JSONContent): string {
	return buildTextIndex(buildSchema().nodeFromJSON(json)).text
}

/**
 * Bandingkan teks versi terpilih (`versionText`) dengan teks draf aktif
 * (`draftText`), hasilnya daftar rentang perubahan dalam koordinat `versionText`.
 */
export function computeVersionDiff(versionText: string, draftText: string): VersionDiffRange[] {
	const ranges: VersionDiffRange[] = []
	let offset = 0

	for (const part of diffWordsWithSpace(versionText, draftText)) {
		if (part.added) {
			// Sisipan berisi spasi/`\n` saja (mis. pemecahan paragraf) tidak
			// membawa kata untuk ditampilkan - markernya hanya membingungkan.
			if (!part.value.trim()) continue
			const last = ranges[ranges.length - 1]
			if (last && last.kind === 'added' && last.offset === offset) {
				last.words = (last.words ?? '') + part.value
			} else {
				ranges.push({ offset, length: 0, kind: 'added', words: part.value })
			}
			continue
		}

		if (part.removed) {
			// Pecah rentang di batas blok: `\n` tidak punya padanan posisi inline
			// di ProseMirror, dan rentang lintas paragraf akan ikut menutupi celah
			// antar blok saat dipetakan oleh `textRangeToPM`.
			let start = 0
			for (let i = 0; i < part.value.length; i++) {
				if (part.value[i] !== '\n') continue
				if (i > start) {
					ranges.push({ offset: offset + start, length: i - start, kind: 'removed' })
				}
				start = i + 1
			}
			if (part.value.length > start) {
				ranges.push({ offset: offset + start, length: part.value.length - start, kind: 'removed' })
			}
			offset += part.value.length
			continue
		}

		offset += part.value.length
	}

	return ranges
}

/** Jalan pintas untuk membandingkan dua naskah JSON langsung. */
export function diffVersionDocuments(version: JSONContent, draft: JSONContent): VersionDiffRange[] {
	return computeVersionDiff(versionPlainText(version), versionPlainText(draft))
}
