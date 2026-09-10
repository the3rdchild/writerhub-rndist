/**
 * Menyaring SVG diagram sebelum ia masuk ke halaman.
 *
 * Keputusan apa yang boleh lewat ada di `diagram-allowlist.ts`; berkas ini
 * hanya penelusur pohonnya. Pemisahan itu disengaja: seluruh keputusan bisa
 * diuji tanpa DOM, dan yang tersisa di sini tinggal lingkaran yang tidak
 * memutuskan apa-apa.
 *
 * Penyaringan **membangun ulang**, bukan mencari-dan-menghapus dengan pola:
 * pohon diurai oleh pengurai XML peramban, lalu tiap simpul dan atribut
 * ditanya. Menyunting SVG orang lain dengan regex adalah cara cepat
 * meloloskan bentuk yang tidak terpikirkan saat polanya ditulis.
 */

import { isAllowedAttribute, isAllowedElement } from './diagram-allowlist'

export type DiagramSanitizeResult = { svg: string; error?: undefined } | { svg?: undefined; error: string }

/**
 * Kenapa `viewBox` diwajibkan, bukan sekadar disarankan.
 *
 * `rasterizeSvg` mengambil ukuran gambar dari `viewBox` (`html-raster.ts`).
 * Tanpa itu diagramnya tampil baik-baik saja di layar lalu **hilang diam-diam
 * dari DOCX** - kegagalan yang baru ketahuan setelah berkasnya dikirim.
 */
const MISSING_VIEWBOX =
	'SVG ini tidak punya viewBox. Tambahkan viewBox="0 0 lebar tinggi" supaya diagramnya bisa diukur saat diekspor.'

/**
 * Kesalahan yang paling sering terjadi, jadi pesannya menyebut jalan keluarnya.
 *
 * Model yang diminta "gambar" sering menjawab dengan potongan HTML - `<div>`
 * berisi kartu, dengan `<svg>` sebagai ikon di dalamnya. Itu bukan diagram yang
 * salah tulis melainkan **rancangan yang salah kamar**: tempatnya di blok
 * rancangan, dan `convert_to_html_block` memindahkannya tanpa menulis ulang
 * apa pun. Pesan yang cuma berkata "harus <svg>" membuat penulis mengira
 * karyanya rusak.
 */
const NOT_SVG =
	'Isi blok ini bukan satu gambar <svg>, melainkan markup HTML. Kalau ini rancangan, ubah jadi blok rancangan (minta AI "render blok ini"). Kalau ini memang diagram, elemen terluarnya harus <svg>.'

function stripDisallowed(element: Element): void {
	for (const attribute of [...element.attributes]) {
		if (isAllowedAttribute(attribute.name, attribute.value)) continue
		element.removeAttribute(attribute.name)
	}

	/*
	 * Anaknya disalin lebih dulu: menghapus dari koleksi hidup sambil
	 * menelusurinya melewatkan simpul, dan yang terlewat di sini persis yang
	 * seharusnya dibuang.
	 */
	for (const child of [...element.children]) {
		if (!isAllowedElement(child.localName)) {
			child.remove()
			continue
		}
		stripDisallowed(child)
	}
}

export function sanitizeDiagramSvg(source: string): DiagramSanitizeResult {
	const trimmed = source.trim()
	if (!trimmed) return { svg: '' }

	// Perender di sisi server tidak punya pengurai; blok ini memang hanya hidup di peramban.
	if (typeof DOMParser === 'undefined') return { svg: '' }

	const parsed = new DOMParser().parseFromString(trimmed, 'image/svg+xml')
	const failure = parsed.getElementsByTagName('parsererror')[0]
	if (failure) {
		return { error: failure.textContent?.trim() || 'SVG ini tidak bisa diurai.' }
	}

	const root = parsed.documentElement
	if (root?.localName !== 'svg') return { error: NOT_SVG }
	if (!root.getAttribute('viewBox')) return { error: MISSING_VIEWBOX }

	stripDisallowed(root)

	/*
	 * Ukuran akar dilucuti, `viewBox` dibiarkan.
	 *
	 * Model gemar menulis `width="100%"` di elemen akar. Digabung dengan
	 * `max-width` di CSS pratinjau, lebar persen di dalam wadah yang menyusut
	 * ke isinya jadi melingkar dan gambarnya runtuh ke nol piksel - petak
	 * kosong yang tidak memberi satu pun petunjuk bahwa SVG-nya sebenarnya
	 * baik-baik saja. Kegagalan yang sama sudah dicatat untuk Mermaid di
	 * `html-raster.ts`; ini menariknya ke jalur layar.
	 *
	 * Sesudah dilucuti, ukurannya sepenuhnya ditentukan CSS di satu tempat -
	 * dan `viewBox` tetap jadi satu-satunya sumber rasio, persis seperti yang
	 * dibaca `svgSize` saat mengekspor. Anak-anaknya tidak disentuh: `width`
	 * pada `<rect>` memang bagian dari gambarnya.
	 */
	root.removeAttribute('width')
	root.removeAttribute('height')
	if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

	return { svg: new XMLSerializer().serializeToString(root) }
}
