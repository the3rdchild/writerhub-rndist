import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { WATERMARK_IMAGE_NAME } from './export-docx-watermark'

/**
 * Sentuhan akhir pada berkas yang sudah dikemas pustaka `docx`, untuk dua hal
 * yang tidak bisa dinyatakan lewat API-nya.
 */

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

export function finalizeDocx(bytes: Uint8Array, options: { watermarkAlpha: number | null }): Uint8Array {
	const files = unzipSync(bytes)
	const out: Record<string, Uint8Array> = {}
	for (const [name, data] of Object.entries(files)) {
		// Entri folder ("word/") tidak dibutuhkan paket OPC.
		if (name.endsWith('/')) continue
		if (name === 'word/document.xml') {
			out[name] = strToU8(attachSectionBreaks(strFromU8(data)))
		} else if (options.watermarkAlpha !== null && /^word\/header\d+\.xml$/.test(name)) {
			out[name] = strToU8(applyWatermarkAlpha(strFromU8(data), options.watermarkAlpha))
		} else {
			out[name] = data
		}
	}
	return zipSync(out, { level: 6 })
}
