/**
 * Memotret sebuah blok HTML menjadi PNG, supaya ia bisa ikut masuk ke DOCX.
 *
 * Word tidak mengenal HTML: rancangan berwarna yang di kanvas tampil sebagai
 * flyer harus menjadi gambar sebelum diekspor. Konsekuensinya jujur - teks di
 * dalam blok itu **tidak lagi bisa dicari atau disunting di Word**. Itu sebabnya
 * blok HTML dipakai untuk cetakan promosi, bukan untuk badan naskah.
 *
 * Caranya lewat `<foreignObject>` di dalam SVG, bukan pustaka pihak ketiga: satu
 * SVG yang memuat HTML-nya digambar ke `<canvas>` lalu dibaca sebagai PNG. Tidak
 * ada dependensi baru, dan batasannya justru cocok dengan `html-sandbox.ts` -
 * `foreignObject` memang hanya bisa merender yang sudah tertanam sendiri.
 *
 * Dua syarat yang lahir dari cara ini:
 *
 * - HTML-nya harus **XML yang sah**; `<br>` tanpa penutup mematikan SVG-nya.
 *   `toXhtml` yang mengurusnya - ia membaca dengan pengurai HTML yang pemaaf,
 *   lalu menuliskannya kembali sebagai XML yang ketat.
 * - Sumber daya jauh tidak ikut. Gambar harus ber-URI `data:`, dan huruf yang
 *   dipakai adalah yang ada di sistem.
 */

import { SANDBOX_CONTENT_CSS, SANDBOX_ROOT_STYLE } from './html-sandbox'

/** Dipotret dua kali lipat supaya tidak pecah saat dicetak. */
const RASTER_SCALE = 2

/**
 * Membaca HTML dengan pengurai yang pemaaf lalu menuliskannya kembali sebagai
 * XML ketat, satu-satunya bentuk yang diterima `foreignObject`. Ia tidak
 * mengurus ukuran - itu urusan `svgSource`.
 */
export function toXhtml(html: string): string {
	const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
	const wrapper = parsed.body.firstElementChild
	if (!wrapper) return ''

	wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
	return new XMLSerializer().serializeToString(wrapper)
}

function svgSource(html: string, width: number, height: number): string {
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
		`<foreignObject x="0" y="0" width="${width}" height="${height}">`,
		// Ruang yang sama dengan bingkai di kanvas, plus dasar gaya yang sama -
		// tanpa keduanya teksnya membungkus di tempat yang berbeda.
		`<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;${SANDBOX_ROOT_STYLE}">`,
		`<style>${SANDBOX_CONTENT_CSS}</style>`,
		toXhtml(html),
		'</div></foreignObject></svg>',
	].join('')
}

function loadImage(source: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('HTML blok ini tidak bisa dipotret'))
		image.src = source
	})
}

/**
 * Mengembalikan PNG sebagai URI `data:`, atau `null` kalau HTML-nya tidak bisa
 * digambar. Kegagalan bukan alasan menggagalkan ekspor: blok yang gagal dipotret
 * cukup tidak ikut, dan sisanya tetap terekspor.
 */
export async function rasterizeHtml(html: string, width: number, height: number): Promise<string | null> {
	if (width <= 0 || height <= 0) return null

	try {
		const image = await loadImage(
			`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource(html, width, height))}`,
		)

		const canvas = document.createElement('canvas')
		canvas.width = Math.round(width * RASTER_SCALE)
		canvas.height = Math.round(height * RASTER_SCALE)

		const context = canvas.getContext('2d')
		if (!context) return null
		context.scale(RASTER_SCALE, RASTER_SCALE)
		context.drawImage(image, 0, 0, width, height)

		return canvas.toDataURL('image/png')
	} catch {
		return null
	}
}
