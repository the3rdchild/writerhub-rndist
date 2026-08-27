/**
 * Bentuk UUID yang dihasilkan Postgres gen_random_uuid(). Tanpa flag global,
 * jadi .test() aman dipakai berulang - regex dengan /g menyimpan lastIndex dan
 * akan memberi hasil berselang-seling.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value)
}
