import type { DocNode, ProseMirrorDoc } from '@/services/drafts/markdown-doc'

/**
 * Blok daftar isi di dalam kerangka template.
 *
 * Daftar isi bukan teks: di editor ia hidup sebagai node `tocBlock`
 * (`apps/web/features/editor/toc-block.ts`) yang menyusun sendiri judul,
 * titik-titik penuntun, dan nomor halamannya dari isi dokumen. Markdown tidak
 * bisa menyatakan node itu, jadi kerangka yang dikompilasi hanya menghasilkan
 * judul "Daftar Isi" yang kosong melompong - dan yang mengisinya kemudian
 * adalah model, dengan mengetik titik satu per satu. Hasilnya berantakan:
 * tipografi akademik merata kanan-kiri, jadi barisan titik itu diregangkan dan
 * nomor halamannya berpencar ke tengah baris.
 *
 * Karena itu blok yang sebenarnya disisipkan di sini, tepat sesudah judul yang
 * memang bagiannya - sama seperti pembatas kolom di `section-columns.ts`.
 */

/** Judul bagian → jenis daftar yang mestinya berdiri di bawahnya. */
const TOC_HEADINGS: ReadonlyArray<{ heading: string; listKind: 'isi' | 'gambar' | 'tabel' }> = [
	{ heading: 'Daftar Isi', listKind: 'isi' },
	{ heading: 'Daftar Tabel', listKind: 'tabel' },
	{ heading: 'Daftar Gambar', listKind: 'gambar' },
]

/**
 * Bentuknya mengikuti `DEFAULT_TOC_ATTRS` di editor; yang disebut di sini
 * hanyalah yang membedakan satu daftar dari yang lain.
 */
function tocBlock(listKind: 'isi' | 'gambar' | 'tabel'): DocNode {
	return { type: 'tocBlock', attrs: { listKind } }
}

function headingText(node: DocNode): string | null {
	if (node.type !== 'heading') return null
	return (node.content ?? [])
		.map((child) => child.text ?? '')
		.join('')
		.trim()
}

/**
 * Menyisipkan blok daftar tepat sesudah judul yang memanggilnya.
 *
 * Judul yang tidak ada di kerangka dilewati tanpa keluhan: tidak setiap
 * template punya Daftar Tabel, dan ketiadaannya bukan kesalahan. Judul yang
 * sudah diikuti blok daftar juga dibiarkan, supaya pemanggilan ganda tidak
 * menumpuk dua daftar isi.
 */
export function withTocBlocks(doc: ProseMirrorDoc): ProseMirrorDoc {
	const content: DocNode[] = []

	for (const [index, node] of doc.content.entries()) {
		content.push(node)

		const text = headingText(node)
		const match = text ? TOC_HEADINGS.find((entry) => entry.heading === text) : undefined
		if (!match) continue
		if (doc.content[index + 1]?.type === 'tocBlock') continue

		content.push(tocBlock(match.listKind))
	}

	return { type: 'doc', content }
}
