import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Menemukan blok diagram yang dimaksud `redraw_diagram`.
 *
 * Model menyebut diagramnya lewat judul, karena judul itulah yang ia terima di
 * tanda terima - ia tidak pernah melihat markup-nya, jadi ia tidak punya
 * pegangan lain. Judulnya sendiri ada di dalam `<title>` gambar itu.
 *
 * Fungsi murni supaya aturan pemilihannya bisa diuji: yang menentukan diagram
 * mana yang tertimpa tidak boleh cuma dijaga oleh pembacaan kode.
 */

const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i

export interface DiagramBlock {
	/** Posisi awal node di dokumen, siap dipakai transaksi ProseMirror. */
	pos: number
	source: string
	title: string
}

export function diagramBlocks(doc: PMNode): DiagramBlock[] {
	const found: DiagramBlock[] = []
	doc.descendants((node, pos) => {
		if (node.type.name !== 'codeBlock' || node.attrs.language !== 'diagram') return
		const source = node.textContent
		found.push({ pos, source, title: TITLE.exec(source)?.[1].trim() ?? '' })
	})
	return found
}

/**
 * Aturannya sengaja pemaaf di satu arah dan ketat di arah lain.
 *
 * Tanpa judul, satu-satunya diagram di dokumen adalah pilihan yang jelas -
 * memaksa model menyebut judul yang belum tentu ia ingat hanya menambah putaran
 * bolak-balik. Tapi kalau ada beberapa dan judulnya tidak disebut, tidak ada
 * yang dipilih: menimpa diagram yang salah jauh lebih mahal daripada meminta
 * penulis menyebut yang mana.
 */
export function findDiagramBlock(blocks: DiagramBlock[], title?: string): DiagramBlock | null {
	if (blocks.length === 0) return null

	const wanted = title?.trim().toLowerCase()
	if (!wanted) return blocks.length === 1 ? blocks[0] : null

	const exact = blocks.filter((block) => block.title.toLowerCase() === wanted)
	if (exact.length === 1) return exact[0]

	const partial = blocks.filter((block) => block.title.toLowerCase().includes(wanted))
	return partial.length === 1 ? partial[0] : null
}

const DRAW_TOOLS: ReadonlySet<string> = new Set(['draw_diagram', 'redraw_diagram'])

export function isDrawTool(name: string): boolean {
	return DRAW_TOOLS.has(name)
}

/**
 * Tipe tata bahasa yang dipakai gambar lama, ditebak dari isinya.
 *
 * Gambar ulang perlu memuat tata bahasa yang sama supaya hasilnya tidak
 * berpindah kaidah di tengah jalan, tapi tipenya tidak ikut tersimpan di
 * dokumen - yang tersimpan cuma SVG-nya. Ditebak dari bentuk yang khas: belah
 * ketupat berarti flowchart, garis dasar dengan tik berarti timeline.
 * `architecture` jadi cadangan karena ia tata bahasa yang paling longgar, jadi
 * salah tebak ke sana paling sedikit merusak.
 */
export function diagramTypeOf(svg: string): string {
	if (/<polygon\b[^>]*points\s*=\s*["'][^"']*\d+,\d+\s+\d+,\d+\s+\d+,\d+\s+\d+,\d+/i.test(svg)) {
		return 'flowchart'
	}
	if (/stroke-dasharray/i.test(svg) && /<line\b/i.test(svg)) return 'timeline'
	return 'architecture'
}
