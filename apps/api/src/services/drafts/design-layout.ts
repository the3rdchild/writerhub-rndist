import {
	PAGE_SIZES,
	type PageOrientation,
	type PageSetup,
	type PageSizeId,
	type TabLayout,
} from '@writer-hub/shared'

/**
 * Tata letak lembar untuk rancangan satu halaman, dibaca dari permintaannya
 * sendiri.
 *
 * Permintaan draf tidak punya medan ukuran kertas - pemanggil eksternal hanya
 * meneruskan kalimat penggunanya. Padahal "poster A3 lanskap" dan "flyer A5"
 * adalah lembar yang benar-benar berbeda, dan blok mode halaman ukurannya
 * persis kotak konten halaman: salah kertas berarti rancangannya salah bentuk
 * sejak lahir, bukan sekadar tampil berbeda.
 *
 * Dibaca dari kata kunci, bukan ditanyakan ke model. Model sudah mengerjakan
 * satu hal yang sulit - merancang halamannya; menambahkan keluaran terstruktur
 * kedua hanya menambah cara ia bisa gagal. Kata kuncinya deterministik, dan
 * kalau tidak ada satu pun yang cocok, A4 potret adalah tebakan yang benar
 * untuk hampir semua flyer.
 */

const SIZE_KEYWORDS: ReadonlyArray<readonly [PageSizeId, RegExp]> = [
	['a3', /\ba3\b/i],
	['a4', /\ba4\b/i],
	['a5', /\ba5\b/i],
	['b4', /\bb4\b/i],
	['b5', /\bb5\b/i],
	['letter', /\bletter\b/i],
	['legal', /\blegal\b/i],
	['tabloid', /\btabloid\b/i],
]

const LANDSCAPE = /\b(landscape|lanskap|mendatar|horizontal|melebar)\b/i
const PORTRAIT = /\b(portrait|potret|tegak|vertikal|vertical)\b/i

export function designPageSize(prompt: string | undefined): PageSizeId {
	if (!prompt) return 'a4'
	return SIZE_KEYWORDS.find(([, pattern]) => pattern.test(prompt))?.[0] ?? 'a4'
}

export function designOrientation(prompt: string | undefined): PageOrientation {
	if (!prompt) return 'portrait'
	if (LANDSCAPE.test(prompt)) return 'landscape'
	if (PORTRAIT.test(prompt)) return 'portrait'
	return 'portrait'
}

/**
 * Margin nol, dan itu bukan penyederhanaan.
 *
 * Rancangan satu halaman memang menembus margin sampai tepi kertas - begitulah
 * ia dirender di kanvas maupun dicetak (`@page flyer`). Menyisakan margin di
 * sini hanya membuat tinggi kotak kontennya lebih pendek dari kertasnya, dan
 * rancangan yang mengisi 100% tinggi jadi berhenti sebelum tepi bawah.
 */
const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 }

export function designPageSetup(prompt: string | undefined): PageSetup {
	return {
		size: designPageSize(prompt),
		orientation: designOrientation(prompt),
		margins: NO_MARGINS,
		pageColor: null,
		pageless: false,
	}
}

export function designLayout(prompt: string | undefined): TabLayout {
	return { pageSetup: designPageSetup(prompt) }
}

/**
 * Kanvas yang akan didapat rancangannya, dalam piksel CSS pada 96 DPI.
 *
 * Ini yang hilang di percobaan pertama, dan akibatnya terlihat: rancangannya
 * hanya mengisi sepertiga atas kertas. Model diminta memakai `height: 100%`
 * tapi tidak pernah diberi tahu lembarnya tinggi atau lebar - jadi ia menyusun
 * komposisi yang lebarnya wajar untuk layar, lalu komposisi itu duduk di
 * puncak kertas potret. Itu bukan model yang buruk, itu perancang yang bekerja
 * tanpa melihat kertasnya.
 *
 * AI Chat tidak punya masalah ini: ia bisa memanggil `get_page_setup` dan
 * membaca kotak kanvasnya. Jalur draf tidak punya alat, jadi angkanya harus
 * ikut di prompt.
 */
export function designCanvas(prompt: string | undefined): { width: number; height: number } {
	const setup = designPageSetup(prompt)
	const { width, height } = PAGE_SIZES[setup.size]
	return setup.orientation === 'landscape' ? { width: height, height: width } : { width, height }
}

/**
 * Satu kalimat untuk prompt: bentuk lembar beserta ukurannya.
 *
 * Urutannya disengaja - bentuk dulu, angka belakangan, dan angkanya dinyatakan
 * sebagai bahan menakar proporsi. Versi pertama menyebut angkanya lebih dulu
 * dan model menyalinnya bulat-bulat menjadi `width: 794px; height: 1123px`,
 * padahal kalimat berikutnya melarang ukuran tetap. Menyebut ukuran persis lalu
 * melarang memakainya adalah dua perintah yang bertabrakan; yang menang selalu
 * yang paling konkret.
 */
export function canvasPrompt(prompt: string | undefined): string {
	const { width, height } = designCanvas(prompt)
	const shape = height >= width ? 'TALL (portrait)' : 'WIDE (landscape)'
	const ratio = (Math.max(width, height) / Math.min(width, height)).toFixed(2)

	return [
		`The sheet is ${shape}, with a ${ratio}:1 side ratio.`,
		`For judging proportions only, that is ${width}x${height} CSS pixels at 96dpi -`,
		'use those numbers to decide how big a headline should feel, NOT as values to',
		'write into your CSS.',
		'Fill the sheet edge to edge: a layout that reaches only the top third is a',
		'failed flyer, not a minimal one.',
	].join(' ')
}
