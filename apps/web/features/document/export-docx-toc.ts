import { DEFAULT_TOC_ATTRS, type TocBlockAttrs, type TocTabLeader } from '@/features/editor/toc-block'
import type { OutlineItem } from '@/features/editor/use-outline-plain'

/**
 * Daftar isi → field `TOC` Word yang bisa diperbarui (OBJ-21, bagian DOCX).
 *
 * Dulu daftar isi keluar sebagai paragraf teks statis `Judul⇥Halaman` - tanpa
 * field, tanpa lekukan tingkat - sehingga di Word ia tidak bisa diperbarui dan
 * semua entrinya rata kiri. Sekarang ia field `TOC` sungguhan dengan hasil
 * tersimpan (cached) berisi entri yang sama dengan yang tampil di kanvas,
 * lengkap dengan lekukan per tingkat dan tautan ke judulnya, jadi tampil benar
 * sebelum Word sempat memperbarui field-nya.
 */

type DocxModule = typeof import('docx')
type XmlComponent = InstanceType<DocxModule['XmlComponent']>
type ParagraphOf = InstanceType<DocxModule['Paragraph']>

export interface TocEntry {
	title: string
	/** Nomor halaman terformat ("iv", "1") dari potretan kanvas. */
	page?: string
	/** Tingkat judul Writer Hub (1-9). */
	level: number
	/** Judul yang dirujuk entri ini, bila ditemukan - sasaran tautannya. */
	heading?: OutlineItem
}

const twips = (px: number) => Math.round(px * 15)

export function tocAttrsOf(attrs: Record<string, unknown>): TocBlockAttrs {
	return { ...DEFAULT_TOC_ATTRS, ...(attrs as Partial<TocBlockAttrs>) }
}

export function tocLevelRange(attrs: TocBlockAttrs): { lo: number; hi: number } {
	return {
		lo: Math.max(1, Math.min(attrs.minLevel, attrs.maxLevel)),
		hi: Math.min(9, Math.max(attrs.minLevel, attrs.maxLevel)),
	}
}

/**
 * Entri daftar isi: baris potretan kanvas (judul + nomor halaman yang dilihat
 * penulis), dicocokkan berurutan dengan judul dokumen untuk tahu tingkatnya
 * dan sasaran tautannya. Daftar yang belum pernah dipotret dibangun dari
 * judul dokumen, tanpa nomor halaman.
 */
export function tocEntriesOf(attrs: TocBlockAttrs, outline: OutlineItem[]): TocEntry[] {
	const { lo, hi } = tocLevelRange(attrs)
	const kind = attrs.listKind === 'isi' ? 'heading' : 'caption'
	const candidates = outline.filter((item) => item.kind === kind && item.level >= lo && item.level <= hi)

	const lines = attrs.snapshot.split('\n').filter((line) => line.trim())
	if (lines.length === 0) {
		return candidates
			.filter((item) => item.text)
			.map((item) => ({ title: item.text, level: item.level, heading: item }))
	}

	let cursor = 0
	return lines.map((line) => {
		const tab = attrs.showPageNumbers ? line.lastIndexOf('\t') : -1
		const title = tab >= 0 ? line.slice(0, tab) : line
		const page = tab >= 0 ? line.slice(tab + 1).trim() || undefined : undefined
		for (let index = cursor; index < candidates.length; index += 1) {
			if (candidates[index].text === title) {
				cursor = index + 1
				return { title, page, level: candidates[index].level, heading: candidates[index] }
			}
		}
		return { title, page, level: lo }
	})
}

/**
 * Instruksi field. Daftar isi memakai gaya judul (`\o`); daftar gambar/tabel
 * memakai gaya caption Heading 7-9 lewat `\t`, karena di Writer Hub caption
 * hidup di tingkat itu - dan importer membaca `\t` seperti itu kembali menjadi
 * daftar gambar/tabel dari contoh teks gayanya.
 */
export function tocInstruction(attrs: TocBlockAttrs): string {
	const { lo, hi } = tocLevelRange(attrs)
	const pages = attrs.showPageNumbers ? '' : ' \\n'
	if (attrs.listKind === 'isi') {
		const from = Math.min(lo, 6)
		const to = Math.min(Math.max(hi, from), 6)
		return ` TOC \\o "${from}-${to}" \\h \\z \\u${pages} `
	}
	const levels = [7, 8, 9].filter((level) => level >= lo && level <= hi)
	const used = levels.length > 0 ? levels : [7, 8, 9]
	const base = used[0] ?? 7
	const styles = used.map((level) => `heading ${level},${level - base + 1}`).join(',')
	return ` TOC \\h \\z \\t "${styles}"${pages} `
}

const LEADERS: Record<TocTabLeader, 'dot' | 'hyphen' | 'underscore' | 'none'> = {
	dots: 'dot',
	dashes: 'hyphen',
	line: 'underscore',
	none: 'none',
}

export function tocLeaderOf(attrs: TocBlockAttrs): 'dot' | 'hyphen' | 'underscore' | 'none' {
	return LEADERS[attrs.tabLeader] ?? 'dot'
}

/** Tingkat tampilan Word (TOC1..TOC9) untuk sebuah entri. */
export function tocDisplayLevel(attrs: TocBlockAttrs, entry: TocEntry): number {
	const { lo } = tocLevelRange(attrs)
	return Math.max(1, Math.min(9, entry.level - lo + 1))
}

/**
 * Gaya `TOC 1`..`TOC 9`: lekukan per tingkat dan perhentian tab rata kanan
 * berpenuntun. Ditaruh di gaya - bukan hanya di entri - karena Word membangun
 * ulang entri dari gaya ini setiap kali field diperbarui.
 */
export function tocParagraphStyles(options: {
	widthTwips: number
	stepPx: number
	leader: 'dot' | 'hyphen' | 'underscore' | 'none'
}) {
	return Array.from({ length: 9 }, (_, index) => ({
		id: `TOC${index + 1}`,
		name: `toc ${index + 1}`,
		basedOn: 'Normal',
		next: 'Normal',
		uiPriority: 39,
		paragraph: {
			indent: { left: twips(options.stepPx * index), firstLine: 0 },
			spacing: { before: 0, after: 100 },
			tabStops: [{ type: 'right' as const, position: options.widthTwips, leader: options.leader }],
		},
	}))
}

/**
 * Blok daftar isi: field TOC yang hasil tersimpannya entri saat ini.
 *
 * `bookmarkOf` memberi nama penanda judul sasaran (`_Toc…`), supaya entri
 * bisa di-Ctrl+klik di Word seperti daftar isi buatannya sendiri. Daftar isi
 * (bukan daftar gambar/tabel) dibungkus kontrol konten galeri "Table of
 * Contents" - wadah yang memberi tombol "Update Table" di Word.
 */
export function tocBlock(
	docx: DocxModule,
	options: {
		attrs: TocBlockAttrs
		entries: TocEntry[]
		widthTwips: number
		bookmarkOf: (entry: TocEntry) => string | undefined
	},
): XmlComponent[] {
	const { attrs, entries, widthTwips } = options
	const { lo } = tocLevelRange(attrs)
	const leader = tocLeaderOf(attrs)
	const element = (
		name: string,
		children: (XmlComponent | string)[] = [],
		attributes?: Record<string, string>,
	) =>
		new docx.BuilderElement({
			name,
			attributes: attributes
				? Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, { key, value }]))
				: undefined,
			children: children as XmlComponent[],
		})
	const fieldRun = (type: 'begin' | 'separate' | 'end', dirty = false) =>
		element('w:r', [
			element('w:fldChar', [], { 'w:fldCharType': type, ...(dirty ? { 'w:dirty': 'true' } : {}) }),
		])

	/*
	 * Hasil kosong (belum ada judul di rentangnya) ditandai kotor: Word mengisi
	 * field itu sendiri saat dibuka, alih-alih menampilkan kekosongan.
	 */
	const begin = [
		fieldRun('begin', entries.length === 0),
		element('w:r', [element('w:instrText', [tocInstruction(attrs)], { 'xml:space': 'preserve' })]),
		fieldRun('separate'),
	]
	const end = [fieldRun('end')]

	const paragraphs: ParagraphOf[] =
		entries.length === 0
			? [new docx.Paragraph({ children: [...begin, ...end] as never })]
			: entries.map((entry, index) => {
					const runs = [
						new docx.TextRun({ text: entry.title }),
						...(attrs.showPageNumbers && entry.page
							? [new docx.TextRun({ children: [new docx.Tab()] }), new docx.TextRun({ text: entry.page })]
							: []),
					]
					const anchor = options.bookmarkOf(entry)
					const content = anchor ? [new docx.InternalHyperlink({ anchor, children: runs })] : runs
					return new docx.Paragraph({
						style: `TOC${tocDisplayLevel(attrs, entry)}`,
						// Lekukan dan tab ditulis juga di entri: sama persis dengan kanvas
						// sampai Word memperbarui field-nya.
						indent: { left: twips((entry.level - lo) * attrs.indentPerLevel), firstLine: 0 },
						...(attrs.showPageNumbers && entry.page
							? { tabStops: [{ type: 'right' as const, position: widthTwips, leader }] }
							: {}),
						children: [
							...(index === 0 ? begin : []),
							...content,
							...(index === entries.length - 1 ? end : []),
						] as never,
					})
				})

	// Daftar gambar/tabel di Word tidak berwadah - sama seperti "Table of Figures"-nya.
	if (attrs.listKind !== 'isi') return paragraphs

	return [
		element('w:sdt', [
			element('w:sdtPr', [
				element('w:docPartObj', [element('w:docPartGallery', [], { 'w:val': 'Table of Contents' })]),
			]),
			element('w:sdtContent', paragraphs),
		]),
	]
}
