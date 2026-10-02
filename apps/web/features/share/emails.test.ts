import { describe, expect, test } from 'bun:test'
import { parseEmails } from './emails'

describe('alamat penerima Bagikan (SHL-10)', () => {
	test('dipisah koma, titik koma, atau spasi; yang bukan alamat dibuang', () => {
		expect(parseEmails('a@contoh.id, b@contoh.id;c@contoh.id  bukan-alamat')).toEqual([
			'a@contoh.id',
			'b@contoh.id',
			'c@contoh.id',
		])
		expect(parseEmails('   ')).toEqual([])
	})
})
