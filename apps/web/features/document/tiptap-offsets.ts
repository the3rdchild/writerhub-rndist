import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Jembatan antara dua sistem koordinat.
 *
 * Worker bekerja pada teks polos dan mengembalikan offset karakter, sedangkan
 * ProseMirror memakai posisi dokumen yang ikut menghitung batas node. Modul ini
 * membangun teks polos dari dokumen sekaligus peta baliknya, sehingga kontrak
 * API tidak perlu tahu-menahu soal ProseMirror.
 */

interface Segment {
	/** Posisi awal potongan ini di dalam teks polos. */
	textStart: number
	/** Posisi awal potongan yang sama di dalam dokumen ProseMirror. */
	pmStart: number
	length: number
}

export interface TextIndex {
	text: string
	segments: Segment[]
}

/**
 * Rangkai teks polos dari dokumen, satu baris per blok teks.
 *
 * Pemisah `\n` antar blok harus sama persis dengan yang dikirim ke API
 * (`editor.getText({ blockSeparator: '\n' })`), karena offset yang dikembalikan
 * worker dihitung terhadap teks itu.
 */
export function buildTextIndex(doc: PMNode): TextIndex {
	const segments: Segment[] = []
	let text = ''

	doc.descendants((node, pos) => {
		// Blok teks (paragraf, heading, item daftar, sel tabel) adalah unit baris.
		if (!node.isTextblock) return true

		if (text.length > 0) text += '\n'

		node.forEach((child, childOffset) => {
			if (!child.isText || !child.text) return
			segments.push({
				textStart: text.length,
				// pos menunjuk ke blok itu sendiri; isinya mulai satu posisi setelahnya.
				pmStart: pos + 1 + childOffset,
				length: child.text.length,
			})
			text += child.text
		})

		return false // inline di dalamnya sudah ditangani
	})

	return { text, segments }
}

function textPosToPM({ segments }: TextIndex, textPos: number): number | null {
	for (const segment of segments) {
		const end = segment.textStart + segment.length
		// `<=` supaya posisi tepat di ujung potongan tetap terpetakan.
		if (textPos >= segment.textStart && textPos <= end) {
			return segment.pmStart + (textPos - segment.textStart)
		}
	}
	return null
}

function pmPosToText({ segments }: TextIndex, pmPos: number): number | null {
	for (const segment of segments) {
		const end = segment.pmStart + segment.length
		if (pmPos >= segment.pmStart && pmPos <= end) {
			return segment.textStart + (pmPos - segment.pmStart)
		}
	}
	return null
}

/**
 * Arah sebaliknya: rentang ProseMirror jadi offset teks polos.
 *
 * Dipakai saat modul dijalankan hanya pada bagian yang disorot - hasilnya
 * berkoordinat potongan, dan offset inilah yang mengembalikannya ke koordinat
 * dokumen.
 */
export function pmRangeToText(
	index: TextIndex,
	from: number,
	to: number,
): { offset: number; length: number } | null {
	const start = pmPosToText(index, from)
	const end = pmPosToText(index, to)
	if (start === null || end === null || end <= start) return null
	return { offset: start, length: end - start }
}

/** Ubah rentang teks polos jadi rentang ProseMirror; null kalau di luar jangkauan. */
export function textRangeToPM(
	index: TextIndex,
	offset: number,
	length: number,
): { from: number; to: number } | null {
	const from = textPosToPM(index, offset)
	const to = textPosToPM(index, offset + length)
	if (from === null || to === null || to <= from) return null
	return { from, to }
}
