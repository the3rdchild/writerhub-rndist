import { describe, expect, test } from 'bun:test'
import { isPgError, PG_ERROR } from './postgres-error'

describe('isPgError', () => {
	test('mengenali galat driver langsung', () => {
		expect(isPgError({ code: '23503' }, PG_ERROR.FOREIGN_KEY_VIOLATION)).toBe(true)
	})

	test('mengenali galat yang dibungkus Drizzle di cause', () => {
		const wrapped = new Error('Failed query: delete from "projects"', { cause: { code: '23503' } })
		expect(isPgError(wrapped, PG_ERROR.FOREIGN_KEY_VIOLATION)).toBe(true)
	})

	test('kode lain dan nilai bukan objek tidak cocok', () => {
		expect(isPgError(new Error('x', { cause: { code: '23505' } }), PG_ERROR.FOREIGN_KEY_VIOLATION)).toBe(
			false,
		)
		expect(isPgError(null, PG_ERROR.FOREIGN_KEY_VIOLATION)).toBe(false)
		expect(isPgError('23503', PG_ERROR.FOREIGN_KEY_VIOLATION)).toBe(false)
	})

	test('cause yang melingkar tidak membuat macet', () => {
		const loop: { cause?: unknown } = {}
		loop.cause = loop
		expect(isPgError(loop, PG_ERROR.FOREIGN_KEY_VIOLATION)).toBe(false)
	})
})
