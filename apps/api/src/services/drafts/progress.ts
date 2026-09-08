import type { DraftPhase } from '@writer-hub/shared'

/**
 * Menaksir seberapa jauh sebuah draf sudah ditulis.
 *
 * Perlu ditegaskan sekali di sini supaya tidak salah dibaca di tempat lain:
 * **tidak ada persentase yang benar-benar pasti untuk keluaran model.** Model
 * tidak tahu panjang naskahnya sendiri sampai ia berhenti menulis. Yang bisa
 * dihitung jujur adalah perbandingan antara karakter yang sudah diterima dan
 * panjang yang memang kami minta di prompt - karena itu `words` di permintaan
 * ikut masuk ke prompt, bukan cuma ke rumus di bawah.
 *
 * Konsekuensinya disengaja: angkanya berhenti di {@link MAX_WRITING_PERCENT}
 * selama naskah masih mengalir. Bar yang menyentuh 100% lalu diam adalah
 * kebohongan yang lebih buruk daripada bar yang berhenti di 95%.
 */

/** Panjang bawaan saat pemanggil tidak meminta panjang tertentu. */
export const DEFAULT_TARGET_WORDS = 600

/**
 * Karakter per halaman rancangan (T8).
 *
 * HTML rancangan yang layak biasanya 6.000–15.000 karakter - jauh di atas
 * target prosa bawaan (600 kata ≈ 3.600 karakter). Tanpa angka sendiri, bar
 * kemajuan rancangan menyentuh batas atas 95% saat baru setengah jadi lalu
 * diam - persis kebohongan yang dicegah kepala berkas ini.
 */
export const DESIGN_CHARS_PER_PAGE = 8_000

/** Rerata kasar panjang kata plus spasinya untuk teks Indonesia maupun Inggris. */
const CHARS_PER_WORD = 6

/** Permintaan sudah dikirim, token pertama belum datang. */
const PREPARING_PERCENT = 5

/** Naskah lengkap, tinggal dikonversi dan disimpan. */
const SAVING_PERCENT = 97

/** Batas atas selama naskah masih ditulis - lihat catatan di kepala berkas. */
export const MAX_WRITING_PERCENT = 95

export function targetCharacters(words: number | undefined): number {
	return Math.max(1, Math.round((words ?? DEFAULT_TARGET_WORDS) * CHARS_PER_WORD))
}

/** Target untuk rancangan: per halaman yang diminta (null berarti satu). */
export function designTargetCharacters(pages: number | null): number {
	return Math.max(1, DESIGN_CHARS_PER_PAGE * Math.max(1, pages ?? 1))
}

export function draftPercent(phase: DraftPhase, characters: number, target: number): number {
	if (phase === 'preparing') return PREPARING_PERCENT
	if (phase === 'saving') return SAVING_PERCENT

	const span = MAX_WRITING_PERCENT - PREPARING_PERCENT
	const ratio = target > 0 ? characters / target : 0

	return Math.min(MAX_WRITING_PERCENT, PREPARING_PERCENT + Math.round(span * Math.max(0, ratio)))
}
