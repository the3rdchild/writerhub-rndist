/**
 * Kode SQLSTATE PostgreSQL yang ditangani khusus oleh repository.
 * Daftar lengkap: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_ERROR = {
	/** foreign_key_violation - baris masih dirujuk tabel lain. */
	FOREIGN_KEY_VIOLATION: '23503',
} as const

export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR]

/**
 * Driver postgres melempar objek biasa, bukan subclass Error, jadi dicek manual.
 * Drizzle membungkusnya dalam `DrizzleQueryError` dengan galat aslinya di
 * `cause`, jadi rantai `cause` ikut ditelusuri - dulu hapus proyek berisi
 * dokumen berakhir 500, bukan 409 (uji editor 2 Okt, SHL-14).
 */
export function isPgError(error: unknown, code: PgErrorCode): boolean {
	for (let current = error, depth = 0; depth < 5; depth++) {
		if (typeof current !== 'object' || current === null) return false
		if ((current as { code?: unknown }).code === code) return true
		current = (current as { cause?: unknown }).cause
	}
	return false
}
