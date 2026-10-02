/**
 * Kode SQLSTATE PostgreSQL yang ditangani khusus oleh repository.
 * Daftar lengkap: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_ERROR = {
	/** foreign_key_violation - baris masih dirujuk tabel lain. */
	FOREIGN_KEY_VIOLATION: '23503',
} as const

export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR]

function hasCode(value: unknown, code: PgErrorCode): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		'code' in value &&
		(value as { code?: unknown }).code === code
	)
}

/**
 * Driver postgres melempar objek biasa, bukan subclass Error, jadi dicek
 * manual. Sejak drizzle 0.44 galat itu dibungkus `DrizzleQueryError` dan
 * aslinya ada di `cause`, jadi keduanya diperiksa - tanpa itu pemeriksaan ini
 * diam-diam tidak pernah cocok lagi.
 */
export function isPgError(error: unknown, code: PgErrorCode): boolean {
	if (hasCode(error, code)) return true
	return typeof error === 'object' && error !== null && 'cause' in error && hasCode(error.cause, code)
}
