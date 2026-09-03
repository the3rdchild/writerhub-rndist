/**
 * Menambal dua kebiasaan halaman web yang paling merusak rancangan satu
 * halaman, sebelum HTML-nya tersimpan.
 *
 * Keduanya dilarang di prompt dan tetap muncul. Itu bukan kejutan: prompt
 * meminta model tidak melakukan sesuatu yang sudah jadi refleksnya, dan refleks
 * menang cukup sering untuk jadi masalah. Yang bisa diperiksa secara pasti
 * sebaiknya diperiksa, bukan diharapkan.
 *
 * Perbaikannya sengaja hanya dua, dan keduanya tekstual - tidak ada CSS yang
 * diurai, tidak ada aturan yang ditulis ulang. Menyunting CSS orang lain dengan
 * regex adalah cara cepat merusak rancangan yang sebenarnya baik-baik saja.
 */

export interface DesignRepair {
	html: string
	/** Apa yang ditambal, untuk dicatat - kalau daftarnya selalu panjang, prompt-nya yang salah. */
	repaired: string[]
}

export interface DesignCanvas {
	width: number
	height: number
}

/**
 * `100vh`/`100vw` menjadi `100%`.
 *
 * Di dalam bingkai keduanya bernilai sama, jadi ini tidak mengubah apa pun
 * hari ini - tapi `vh` mengukur bingkai, bukan induknya, dan itu membuat
 * rancangan yang sama pecah begitu ia dipakai sebagai sisipan alih-alih satu
 * halaman. Nilai vh lain dibiarkan: `50vh` menjadi `50%` hanya setara kalau
 * induknya kebetulan setinggi penuh, dan menebak itu lebih berbahaya daripada
 * membiarkannya.
 */
const FULL_VIEWPORT = /\b100v[hw]\b/g

function escapeNumber(value: number): string {
	return String(Math.round(value))
}

/**
 * Ukuran tetap sebesar kertasnya menjadi `100%`.
 *
 * Hanya angka yang PERSIS sama dengan lembarnya yang disentuh. Itu batas yang
 * penting: angka itu pasti datang dari kanvas yang kami sebutkan sendiri di
 * prompt, jadi menggantinya tidak pernah mengubah maksud perancangnya - ia
 * hanya membuat rancangan yang sama ikut benar ketika kertasnya berubah.
 * Ukuran tetap lain - kartu selebar 320px di dalam tata letak - dibiarkan utuh,
 * karena itu keputusan rancangan, bukan salah paham soal kertas.
 *
 * Ini juga yang melumpuhkan idiom "meja dan kertas" tanpa perlu menyentuhnya:
 * anak yang tingginya penuh tidak menyisakan apa pun untuk ditengahkan
 * `align-items:center`, dan menutup habis latar gelap yang dicat di belakangnya.
 */
function sheetSizedRule(property: 'width' | 'height', pixels: number): RegExp {
	return new RegExp(`(\\b${property}\\s*:\\s*)${escapeNumber(pixels)}(?:\\.0+)?px`, 'gi')
}

export function repairDesignHtml(html: string, canvas: DesignCanvas): DesignRepair {
	const repaired: string[] = []
	let next = html

	if (FULL_VIEWPORT.test(next)) {
		next = next.replace(FULL_VIEWPORT, '100%')
		repaired.push('satuan viewport (100vh/100vw) menjadi 100%')
	}
	// `test` pada regex ber-flag /g memindahkan lastIndex; tanpa reset ini
	// pemanggilan berikutnya melewatkan awal berkas.
	FULL_VIEWPORT.lastIndex = 0

	for (const [property, pixels] of [
		['width', canvas.width],
		['height', canvas.height],
	] as const) {
		const pattern = sheetSizedRule(property, pixels)
		if (!pattern.test(next)) continue
		pattern.lastIndex = 0
		next = next.replace(pattern, '$1100%')
		repaired.push(`${property} tetap ${escapeNumber(pixels)}px menjadi 100%`)
	}

	return { html: next, repaired }
}
