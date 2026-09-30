import { describe, expect, test } from 'bun:test'
import { queuePositionFrom } from '@/lib/queue'

describe('queuePositionFrom', () => {
	// List tunggu: [terbaru, …, tertua]; worker mengambil dari kanan.
	test('elemen paling kanan adalah giliran berikutnya', () => {
		expect(queuePositionFrom(4, 5)).toBe(1)
		expect(queuePositionFrom(0, 5)).toBe(5)
		expect(queuePositionFrom(0, 1)).toBe(1)
	})

	test('job yang sudah diambil worker tidak punya posisi', () => {
		expect(queuePositionFrom(null, 3)).toBeNull()
		expect(queuePositionFrom(null, 0)).toBeNull()
	})

	test('indeks di luar panjang list tidak ditebak', () => {
		expect(queuePositionFrom(3, 3)).toBeNull()
		expect(queuePositionFrom(-1, 3)).toBeNull()
	})
})
