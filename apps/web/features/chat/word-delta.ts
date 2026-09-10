import { computeVersionDiff } from '@/features/versions/diff'
import { countWords } from '@/lib/utils'

/**
 * Seberapa besar satu suntingan mengubah naskah, dalam kata.
 *
 * Sengaja memakai pembanding yang sama dengan Riwayat versi
 * (`features/versions/diff.ts`), bukan hitungan sendiri yang lebih murah.
 * Angka yang sama muncul di dua tempat - kartu aksi dan label versi - dan dua
 * cara hitung yang berbeda cepat atau lambat akan berselisih tanpa ada yang
 * tahu mana yang benar.
 *
 * Kata, bukan karakter: `+128 −34` terbaca wajar oleh penulis, sedangkan
 * karakter berisik dan paragraf terlalu kasar untuk suntingan kecil.
 */
export interface WordDelta {
	added: number
	removed: number
}

export function wordDelta(before: string, after: string): WordDelta {
	let added = 0
	let removed = 0

	for (const range of computeVersionDiff(before, after)) {
		if (range.kind === 'added') {
			added += countWords(range.words ?? '')
			continue
		}
		// Rentang yang dihapus menunjuk ke teks lama, jadi katanya diambil dari sana.
		removed += countWords(before.slice(range.offset, range.offset + range.length))
	}

	return { added, removed }
}

export function sumWordDeltas(deltas: WordDelta[]): WordDelta {
	return deltas.reduce(
		(total, delta) => ({
			added: total.added + delta.added,
			removed: total.removed + delta.removed,
		}),
		{ added: 0, removed: 0 },
	)
}

/**
 * Mengembalikan `null` untuk perubahan nol - aksi yang tidak menyentuh naskah
 * (atur margin, buka proofreader) tidak punya angka yang berarti, dan `+0 −0`
 * terbaca seperti kegagalan.
 */
export function formatWordDelta(delta: WordDelta): string | null {
	if (delta.added === 0 && delta.removed === 0) return null
	return `+${delta.added} −${delta.removed} kata`
}
