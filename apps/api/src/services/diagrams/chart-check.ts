/**
 * Memeriksa bahwa bentuk chart benar-benar mewakili angkanya.
 *
 * Ini penjagaan yang paling berarti di seluruh berkas diagram, dan alasannya
 * bukan estetika. Diagram struktur yang salah **terlihat** jelek - simpulnya
 * tumpang tindih, panahnya kacau, dan penulis langsung tahu ada yang keliru.
 * Chart yang salah skala tidak terlihat salah sama sekali: batangnya rapi,
 * sumbunya lurus, labelnya benar. Yang salah cuma tingginya - dan itu berarti
 * **data yang salah** di dalam naskah orang, dengan tampilan yang meyakinkan.
 *
 * Karena itu tiap mark wajib membawa `data-value` berisi angka aslinya. Dengan
 * angka itu, proporsinya bisa diperiksa secara aritmetika: batang yang nilainya
 * dua kali lipat harus dua kali lebih tinggi. Tanpa angka itu tidak ada satu
 * pun cara memeriksanya, dan itu sebabnya ketiadaannya sendiri jadi keluhan.
 */

const NUMBER = '["\']([-\\d.]+)["\']'

/** Toleransi pembulatan koordinat. Di bawah ini bukan kesalahan, cuma piksel bulat. */
const TOLERANCE = 0.04

function attr(tag: string, name: string): number {
	const match = new RegExp(`\\b${name}\\s*=\\s*${NUMBER}`).exec(tag)
	return match ? Number.parseFloat(match[1]) : Number.NaN
}

interface Mark {
	value: number
	extent: number
}

function marksOf(svg: string, element: string, extentAttr: string): Mark[] {
	const marks: Mark[] = []
	for (const [tag] of svg.matchAll(new RegExp(`<${element}\\b[^>]*>`, 'gi'))) {
		const value = attr(tag, 'data-value')
		const extent = attr(tag, extentAttr)
		if (Number.isFinite(value) && Number.isFinite(extent)) marks.push({ value, extent })
	}
	return marks
}

/**
 * Rasio bentuk terhadap nilai harus sama untuk semua mark.
 *
 * Dipakai untuk batang, yang tingginya berbanding lurus dengan nilainya dari
 * garis dasar yang sama.
 */
function proportionalProblem(marks: Mark[], what: string): string | null {
	const usable = marks.filter((mark) => mark.value !== 0)
	if (usable.length < 2) return null

	const ratios = usable.map((mark) => mark.extent / mark.value)
	const low = Math.min(...ratios)
	const high = Math.max(...ratios)
	if (low <= 0) return `${what}: a value maps to a zero or negative size`
	if (high / low <= 1 + TOLERANCE) return null

	const worst = usable[ratios.indexOf(high)]
	const best = usable[ratios.indexOf(low)]
	return `${what}: the sizes do not match the numbers — ${best.value} is drawn at ${Math.round(best.extent)}px but ${worst.value} at ${Math.round(worst.extent)}px, which is not the same scale. Recompute every mark from one scale factor`
}

/**
 * Untuk titik, nilainya dipetakan ke posisi lewat sumbu - jadi yang harus tetap
 * bukan rasio melainkan **jarak antar nilai**: dua titik yang selisih nilainya
 * sama harus terpisah sejauh yang sama.
 */
function linearProblem(marks: Mark[], what: string): string | null {
	if (marks.length < 3) return null

	const sorted = [...marks].sort((a, b) => a.value - b.value)
	const slopes: number[] = []
	for (let index = 1; index < sorted.length; index++) {
		const spread = sorted[index].value - sorted[index - 1].value
		if (spread === 0) continue
		slopes.push((sorted[index].extent - sorted[index - 1].extent) / spread)
	}
	if (slopes.length < 2) return null

	/*
	 * Dibandingkan menurut besarnya, bukan menurut nilai bertandanya. Kemiringan
	 * di sumbu tegak selalu negatif - koordinat y bertambah ke bawah - jadi
	 * -10 dan -18 adalah dua skala yang berbeda, sementara pembagian langsung
	 * menghasilkan 0,55 dan terbaca seolah wajar.
	 */
	if (new Set(slopes.map(Math.sign)).size > 1) {
		return `${what}: the axis reverses direction partway — every point must map through one scale`
	}

	const magnitudes = slopes.map(Math.abs)
	const low = Math.min(...magnitudes)
	const high = Math.max(...magnitudes)
	if (low === 0 || high / low > 1 + TOLERANCE * 4) {
		return `${what}: the points are not on one scale — equal steps in value must be equal distances on the axis. Recompute every point from one scale factor`
	}
	return null
}

/**
 * Keluhan tentang angka, kosong kalau tidak ada - atau kalau gambarnya memang
 * bukan chart. Tipe struktural tidak punya `data-value` dan tidak seharusnya
 * punya, jadi ketiadaannya di sana bukan kesalahan.
 */
export function chartProblems(svg: string, type: string): string[] {
	if (!CHART_TYPES.has(type)) return []

	const bars = marksOf(svg, 'rect', 'height')
	const points = marksOf(svg, 'circle', 'cy')
	if (bars.length === 0 && points.length === 0) {
		return [
			'no data-value on any mark — every bar, point or segment must carry data-value with its real number, otherwise nothing can check that the drawing matches the data',
		]
	}

	return [proportionalProblem(bars, 'bars'), linearProblem(points, 'points')].filter(
		(problem): problem is string => problem !== null,
	)
}

export const CHART_TYPES: ReadonlySet<string> = new Set(['bar', 'line', 'scatter'])
