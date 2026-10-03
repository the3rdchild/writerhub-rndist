import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { WATERMARK_IMAGE_NAME } from './export-docx-watermark'

/**
 * Sentuhan akhir pada berkas yang sudah dikemas pustaka `docx`, untuk hal-hal
 * yang tidak bisa dinyatakan - atau keliru dikerjakan - lewat API-nya.
 */

/**
 * Karakter yang tidak sah di XML 1.0: kontrol C0 selain tab/LF/CR, U+FFFE/FFFF,
 * dan surrogate tanpa pasangan. Tempelan teks polos dan impor PDF bisa
 * membawanya ke naskah; pustaka `docx` meneruskannya mentah, dan satu saja
 * sudah membuat `document.xml` rusak - Word dan LibreOffice menolak membuka
 * berkasnya sama sekali.
 */
const INVALID_XML_CHAR =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: justru karakter kontrol yang dicari dan dibuang
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Rujukan karakter (`&#11;`, `&#x1F;`) ke karakter yang sama tidak sahnya. */
const CHARACTER_REFERENCE = /&#(x[0-9a-fA-F]+|[0-9]+);/g

function isXmlChar(code: number): boolean {
	return (
		code === 0x9 ||
		code === 0xa ||
		code === 0xd ||
		(code >= 0x20 && code <= 0xd7ff) ||
		(code >= 0xe000 && code <= 0xfffd) ||
		(code >= 0x10000 && code <= 0x10ffff)
	)
}

export function stripInvalidXmlChars(xml: string): string {
	return xml.replace(INVALID_XML_CHAR, '').replace(CHARACTER_REFERENCE, (reference, value: string) => {
		const code = value.startsWith('x') ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10)
		return isXmlChar(code) ? reference : ''
	})
}

const SECTION_PARAGRAPH = /<w:p><w:pPr><w:sectPr>([\s\S]*?)<\/w:sectPr><\/w:pPr><\/w:p>/g

/**
 * `w:sectPr` menumpang di paragraf terakhir section-nya (KOL-17).
 *
 * Pustaka `docx` menutup setiap section kecuali yang terakhir dengan paragraf
 * kosong yang isinya hanya `w:sectPr`. Di Word paragraf itu baris kosong
 * sungguhan: dokumen jurnal 1 → 2 → 1 kolom mendapat dua baris kosong
 * tambahan. Word sendiri menaruh `w:sectPr` di `w:pPr` paragraf terakhir
 * section. Paragraf pemisah tetap dipertahankan bila yang mendahuluinya bukan
 * paragraf biasa (tabel, kontrol konten daftar isi, section kosong) atau
 * paragraf yang memuat field - di sana Word memang butuh paragraf sendiri.
 */
export function attachSectionBreaks(xml: string): string {
	const matches = [...xml.matchAll(SECTION_PARAGRAPH)]
	let out = xml
	for (const match of matches.reverse()) {
		const at = match.index ?? -1
		if (at < 0 || !out.slice(0, at).endsWith('</w:p>')) continue

		const start = Math.max(out.lastIndexOf('<w:p>', at - 1), out.lastIndexOf('<w:p ', at - 1))
		if (start < 0) continue
		const previous = out.slice(start, at)
		if (previous.includes('<w:fldChar') || previous.includes('<w:sectPr') || previous.includes('<w:tbl>'))
			continue

		const sectPr = `<w:sectPr>${match[1]}</w:sectPr>`
		const openEnd = previous.indexOf('>') + 1
		const merged = previous.startsWith('<w:pPr>', openEnd)
			? previous.replace('</w:pPr>', `${sectPr}</w:pPr>`)
			: `${previous.slice(0, openEnd)}<w:pPr>${sectPr}</w:pPr>${previous.slice(openEnd)}`
		out = out.slice(0, start) + merged + out.slice(at + match[0].length)
	}
	return out
}

/**
 * Opasitas gambar watermark (`a:alphaModFix`) pada gambar yang bernama
 * `WATERMARK_IMAGE_NAME` - `ImageRun` tidak punya opsinya.
 */
export function applyWatermarkAlpha(xml: string, amount: number): string {
	return xml.replace(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g, (anchor) => {
		if (!anchor.includes(`name="${WATERMARK_IMAGE_NAME}"`)) return anchor
		return anchor.replace(
			/<a:blip\b([^>]*?)\/>/,
			(_, attributes: string) => `<a:blip${attributes}><a:alphaModFix amt="${amount}"/></a:blip>`,
		)
	})
}

/**
 * Urutan part yang diberi nomor ulang: naskah dulu, lalu header/footer menurut
 * nomornya, lalu catatan - sama dengan urutan baca Word.
 */
function partOrder(name: string): [number, number] {
	const number = Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0)
	if (name === 'word/document.xml') return [0, 0]
	if (/^word\/header\d+\.xml$/.test(name)) return [1, number]
	if (/^word\/footer\d+\.xml$/.test(name)) return [2, number]
	return [3, number]
}

/**
 * Id `wp:docPr` dan pasangan penanda (`w:bookmarkStart`/`w:bookmarkEnd`) unik di
 * seluruh berkas.
 *
 * Pustaka `docx` memberi setiap gambar `wp:docPr id="1"` - dua belas ubin
 * watermark di satu header semuanya id 1 - dan setiap penanda `w:id="1"`,
 * karena penghitungnya dibuat ulang per objek. Id kembar dianggap kerusakan
 * oleh Word. Penanda dipasangkan menurut sarangnya (LIFO): awal dan akhir
 * sebuah penanda selalu mendapat nomor yang sama.
 */
export function renumberIds(parts: Map<string, string>): void {
	let drawing = 0
	let bookmark = 0
	const names = [...parts.keys()].sort((a, b) => {
		const [groupA, numberA] = partOrder(a)
		const [groupB, numberB] = partOrder(b)
		return groupA - groupB || numberA - numberB || a.localeCompare(b)
	})
	for (const name of names) {
		const xml = parts.get(name) ?? ''
		if (!xml.includes('<wp:docPr') && !xml.includes('<w:bookmark')) continue
		const open: number[] = []
		const next = xml
			.replace(/<wp:docPr\b[^>]*>/g, (tag) => {
				drawing += 1
				return tag.replace(/\sid="[^"]*"/, ` id="${drawing}"`)
			})
			.replace(/<w:bookmark(Start|End)\b[^>]*>/g, (tag, kind: string) => {
				let id: number
				if (kind === 'Start') {
					bookmark += 1
					id = bookmark
					open.push(id)
				} else {
					id = open.pop() ?? 0
				}
				return tag.replace(/\sw:id="[^"]*"/, ` w:id="${id}"`)
			})
		parts.set(name, next)
	}
}

export function finalizeDocx(bytes: Uint8Array, options: { watermarkAlpha: number | null }): Uint8Array {
	const files = unzipSync(bytes)
	const parts = new Map<string, string>()
	const out: Record<string, Uint8Array> = {}
	for (const [name, data] of Object.entries(files)) {
		// Entri folder ("word/") tidak dibutuhkan paket OPC.
		if (name.endsWith('/')) continue
		if (/\.(xml|rels)$/.test(name)) parts.set(name, stripInvalidXmlChars(strFromU8(data)))
		else out[name] = data
	}

	const document = parts.get('word/document.xml')
	if (document !== undefined) parts.set('word/document.xml', attachSectionBreaks(document))
	if (options.watermarkAlpha !== null) {
		for (const [name, xml] of parts) {
			if (/^word\/header\d+\.xml$/.test(name))
				parts.set(name, applyWatermarkAlpha(xml, options.watermarkAlpha))
		}
	}
	renumberIds(parts)

	for (const [name, xml] of parts) out[name] = strToU8(xml)
	return zipSync(out, { level: 6 })
}
