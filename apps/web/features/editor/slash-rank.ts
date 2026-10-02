/**
 * Penyaring menu slash dengan peringkat.
 *
 * Dulu hasilnya hanya disaring, dengan urutan daftar apa adanya: `/tabel` lalu
 * Enter menyisipkan "Daftar tabel", karena butir itu tertulis lebih dulu dan
 * kata kuncinya juga memuat "tabel" (uji editor 2 Okt, TBL-13). Kini label
 * yang cocok persis selalu di depan, lalu awal label, awal kata di label,
 * kata kunci, dan terakhir kecocokan di tengah kata. Urutan asli hanya
 * memutus seri.
 */

export interface RankableItem {
	label: string
	keywords: string[]
}

function score(item: RankableItem, query: string): number {
	const label = item.label.toLowerCase()
	const keywords = item.keywords.map((keyword) => keyword.toLowerCase())
	if (label === query) return 0
	if (keywords.includes(query)) return 1
	if (label.startsWith(query)) return 2
	if (label.split(/[\s()/-]+/).some((word) => word.startsWith(query))) return 3
	if (keywords.some((keyword) => keyword.startsWith(query))) return 4
	if (label.includes(query)) return 5
	if (keywords.some((keyword) => keyword.includes(query))) return 6
	return -1
}

export function rankSlashItems<T extends RankableItem>(items: readonly T[], rawQuery: string): T[] {
	const query = rawQuery.trim().toLowerCase()
	if (!query) return [...items]
	return items
		.map((item, index) => ({ item, index, rank: score(item, query) }))
		.filter((entry) => entry.rank >= 0)
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((entry) => entry.item)
}
