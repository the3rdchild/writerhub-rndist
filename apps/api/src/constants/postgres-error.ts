/**
 * Kode SQLSTATE PostgreSQL yang ditangani khusus oleh repository.
 * Daftar lengkap: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_ERROR = {
	/** foreign_key_violation - baris masih dirujuk tabel lain. */
	FOREIGN_KEY_VIOLATION: '23503',
} as const

export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR]

/** Driver postgres melempar objek biasa, bukan subclass Error, jadi dicek manual. */
export function isPgError(error: unknown, code: PgErrorCode): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === code
	)
}
