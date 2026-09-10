/**
 * Mengganti palet satu diagram tanpa menggambarnya ulang.
 *
 * Dasarnya satu pengamatan: versi terang dan versi gelap diagram editorial
 * **geometrinya identik**. Dibandingkan berdampingan, jumlah kemunculan tiap
 * warna cocok satu per satu - 25x muted, 12x paper, 8x ink, 7x accent - dan yang
 * berubah hanya nilainya. Lihat `docs/DIAGRAM-DESIGN-PLAN.md` §5.2.
 *
 * Artinya perpindahan palet tidak butuh model sama sekali. Menyerahkannya ke
 * model berarti membayar ratusan baris koordinat untuk mengubah tujuh angka,
 * dan memberi model kesempatan merusak tata letak yang sudah benar. Substitusi
 * deterministik tidak bisa melakukan keduanya.
 */

export interface DiagramPalette {
	/** Latar dan isi simpul. */
	paper: string
	/** Isi sekunder. */
	paper2: string
	/** Teks dan garis utama. */
	ink: string
	/** Teks sekunder dan panah. */
	muted: string
	/** Sublabel dan label zona. */
	soft: string
	/** Simpul fokal - satu atau dua saja. */
	accent: string
	/** Panggilan ke luar. */
	link: string
}

/** Palet bawaan, dan sekaligus yang dipakai sebagai sumber substitusi. */
export const LIGHT_PALETTE: DiagramPalette = {
	paper: '#f5f5f5',
	paper2: '#ececec',
	ink: '#2d3142',
	muted: '#4f5d75',
	soft: '#7a8399',
	accent: '#eb6c36',
	link: '#2e5aa8',
}

export const DARK_PALETTE: DiagramPalette = {
	paper: '#2d3142',
	paper2: '#393e53',
	ink: '#f5f5f5',
	muted: '#bfc0c0',
	soft: '#8e98ac',
	accent: '#f08a59',
	link: '#6a95d8',
}

/**
 * Bentuk `rgba()` dari token yang memang muncul begitu di diagram.
 *
 * `rgba(45,49,66,0.10)` bukan warna lain melainkan `ink` pada opasitas - jadi ia
 * harus ikut berpindah, kalau tidak garis rambut di atas kertas gelap tetap
 * digambar dengan tinta gelap dan menghilang.
 */
const RGBA_ROLES: ReadonlyArray<keyof DiagramPalette> = ['ink', 'muted', 'soft', 'accent']

function rgbTriplet(hex: string): string | null {
	const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
	if (!match) return null
	const value = Number.parseInt(match[1], 16)
	return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`
}

function escapeForRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Satu lintasan, bukan penggantian berurutan.
 *
 * Terang dan gelap saling menukar dua nilai: `#2d3142` menjadi `#f5f5f5` dan
 * sebaliknya. Diganti satu per satu, penggantian kedua akan membalik hasil
 * penggantian pertama dan seluruh diagram keluar dengan satu warna.
 */
export function reskinSvg(svg: string, palette: DiagramPalette): string {
	const replacements = new Map<string, string>()

	for (const role of Object.keys(LIGHT_PALETTE) as Array<keyof DiagramPalette>) {
		const from = LIGHT_PALETTE[role]
		const to = palette[role]
		if (from.toLowerCase() !== to.toLowerCase()) replacements.set(from.toLowerCase(), to)
	}

	const rgbaFrom = new Map<string, string>()
	for (const role of RGBA_ROLES) {
		const from = rgbTriplet(LIGHT_PALETTE[role])
		const to = rgbTriplet(palette[role])
		if (from && to && from !== to) rgbaFrom.set(from, to)
	}

	const patterns = [
		...[...replacements.keys()].map(escapeForRegex),
		...[...rgbaFrom.keys()].map((triplet) => `rgba\\(\\s*${triplet.replace(/,/g, '\\s*,\\s*')}\\s*,`),
	]
	if (patterns.length === 0) return svg

	return svg.replace(new RegExp(patterns.join('|'), 'gi'), (match) => {
		const hex = replacements.get(match.toLowerCase())
		if (hex) return hex

		const triplet = match.replace(/[^\d,]/g, '').replace(/,$/, '')
		const target = rgbaFrom.get(triplet)
		return target ? `rgba(${target},` : match
	})
}

/**
 * Palet yang setengah lengkap lebih buruk daripada tidak ada palet.
 *
 * Diagram yang kertasnya ikut rancangan tapi tintanya tidak akan keluar sebagai
 * teks gelap di atas kertas gelap - tak terbaca, dan tidak jelas apa yang salah.
 * Lebih baik ia tetap memakai palet bawaannya yang utuh.
 */
export function isCompletePalette(palette: Partial<DiagramPalette>): palette is DiagramPalette {
	return (Object.keys(LIGHT_PALETTE) as Array<keyof DiagramPalette>).every(
		(role) => typeof palette[role] === 'string' && /^#[0-9a-f]{6}$/i.test(palette[role] as string),
	)
}
