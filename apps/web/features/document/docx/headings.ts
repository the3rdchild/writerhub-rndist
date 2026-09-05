/**
 * Menentukan tingkat judul sebuah paragraf DOCX.
 *
 * Tiga sumber, berurutan: `w:outlineLvl`, nama style (termasuk nama yang
 * dilokalkan), lalu - hanya untuk dokumen yang tidak punya kerangka sama
 * sekali - pola nomor di awal teks. Sumber ketiga sengaja dijaga ketat:
 * heuristik yang terlalu longgar menaikkan caption menjadi judul.
 */
import type { JSONContent } from '@tiptap/core'
import type { ParagraphProps } from './properties'

/**
 * Nama style "Heading N" dalam berbagai bahasa. Word menyimpan nama yang
 * dilokalkan (mis. `제목 1`, `Judul 1`), dan dokumen kolaboratif lintas bahasa
 * membawanya sebagaimana adanya — pola bahasa Inggris saja tidak akan cocok.
 */
const HEADING_WORDS =
	'heading|judul|titel|titre|überschrift|overskrift|rubrik|encabezado|t[íi]tulo|заголовок|название|見出し|标题|標題|제목|cím|nadpis|nagł[óo]wek|başlık|intestazione|kop|otsikko'

const HEADING_NAME = new RegExp(`^(?:\\d+[.\\s]*)?(?:${HEADING_WORDS})(?:\\s*(\\d))?$`, 'i')

function levelFromName(name: string | undefined): number | undefined {
	if (!name) return undefined
	const trimmed = name.trim()
	if (!trimmed) return undefined

	const numbered = /^heading\s*([1-9])$/i.exec(trimmed)
	if (numbered) return Number.parseInt(numbered[1] as string, 10)
	if (/^subtitle$/i.test(trimmed)) return 2
	if (/^title$/i.test(trimmed)) return 1

	// Nama terlokalisasi: `Judul 3`, `제목1`, `1.제목` — angka bisa di ujung
	// atau di depan; tanpa angka dianggap setara Title (tingkat 1).
	const localized = HEADING_NAME.exec(trimmed)
	if (localized) {
		const digit = localized[1]
		return digit ? Number.parseInt(digit, 10) : 1
	}
	return undefined
}

/**
 * Level heading sebuah paragraf. Urutan keputusan:
 * 1. `w:outlineLvl` langsung maupun warisan style (sudah tergabung di props).
 * 2. Nama style — daun maupun mana pun di rantai `basedOn`-nya.
 * 3. Heuristik nomor di awal teks (aktif hanya bila dokumen punya cukup
 *    kandidat — lihat `numberedHeadingOf`).
 * Level tidak dipengerit ke 6: ekspor menulis 7–9 sebagai Heading 6 +
 * outline, dan daftar gambar/tabel dibangun dari level itu.
 */
export function headingLevel(
	props: ParagraphProps,
	styleNames: string[],
	numbered?: number,
): number | undefined {
	if (props.outlineLevel !== undefined) return props.outlineLevel + 1

	// Rantai tersusun dasar → daun; yang paling spesifik menang, jadi ditelusuri
	// dari belakang. Style "SubJudul" berbasis "Heading 2" ikut daunnya dulu.
	for (let index = styleNames.length - 1; index >= 0; index -= 1) {
		const level = levelFromName(styleNames[index])
		if (level !== undefined) return level
	}

	return numbered
}

/**
 * Kandidat heading bernomor: "2. LANDASAN TEORI", "2.1. Microcontroller".
 * Dokumen yang style-nya tak terpeta ke heading mana pun (jurnal, templat
 * lama) tetap menyimpan kerangkanya sebagai nomor di awal teks.
 */
const NUMBERED_HEADING = /^\d{1,2}(?:\.\d{1,2}){0,4}[.)]?\s+\S/u

export function numberedHeadingLevel(text: string): number | undefined {
	const trimmed = text.trim()
	if (trimmed.length === 0 || trimmed.length > 100) return undefined
	if (!NUMBERED_HEADING.test(trimmed)) return undefined
	// Kalimat biasa berakhir tanda baca; entri daftar isi basi berakhir angka halaman.
	if (/[.!?:;]$/.test(trimmed) || /\d$/.test(trimmed)) return undefined

	const segments = /^[\d.]+/.exec(trimmed)?.[0] ?? ''
	const depth = segments.split('.').filter(Boolean).length
	return depth >= 1 && depth <= 5 ? depth : undefined
}

/**
 * Promosikan kandidat heading bernomor (`_maybeHeading`) menjadi heading —
 * hanya bila dokumen ini tidak punya satu pun heading terdeteksi dan kandidatnya
 * cukup banyak. Dokumen yang kerangkanya sudah terbaca lewat style tidak
 * disentuh: heuristik tidak boleh menaikkan caption atau kalimat biasa.
 */
export function promoteNumberedHeadings(blocks: JSONContent[]): JSONContent[] {
	const attrsOf = (block: JSONContent) => (block.attrs ?? {}) as Record<string, unknown>
	const candidates = blocks.filter((block) => block.type === 'paragraph' && attrsOf(block)._maybeHeading)
	const hasHeading = blocks.some((block) => block.type === 'heading')

	for (const block of blocks) {
		if (block.type !== 'paragraph') continue
		const attrs = attrsOf(block)
		if (!('_maybeHeading' in attrs)) continue
		if (candidates.length >= 2 && !hasHeading) {
			block.type = 'heading'
			attrs.level = attrs._maybeHeading
		}
		delete attrs._maybeHeading
		if (Object.keys(attrs).length === 0) delete (block as { attrs?: unknown }).attrs
	}
	return blocks
}
