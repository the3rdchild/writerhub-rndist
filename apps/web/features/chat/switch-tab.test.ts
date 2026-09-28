import { describe, expect, test } from 'bun:test'
import { findInOtherTabs } from './tools'

describe('findInOtherTabs (UC7)', () => {
	test('menemukan teks di tab lain yang bukan tab aktif', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'b' ? 'Bagian Metode di sini' : null),
		}
		const found = findInOtherTabs(ctx, 'Metode')
		expect(found).toEqual({ id: 'b', label: 'Bab 2' })
	})

	test('tidak memakai tab aktif', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'a' ? 'Metode ada' : null),
		}
		// Tab aktif memang mengandung teks, tapi findInOtherDirs hanya mencari
		// tab lain - tab aktif bukan urusannya.
		expect(findInOtherTabs(ctx, 'Metode')).toBeNull()
	})

	test('case-insensitive', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'b' ? 'Kata KUNCI besar' : null),
		}
		expect(findInOtherTabs(ctx, 'kunci')).toEqual({ id: 'b', label: 'Bab 2' })
	})

	test('null bila tidak ada tab lain', () => {
		const ctx = {
			tabs: [{ id: 'a', label: 'Bab 1', active: true }],
			readTab: () => 'teks',
		}
		expect(findInOtherTabs(ctx, 'teks')).toBeNull()
	})

	test('null bila teks tidak ada di tab manapun', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'b' ? 'tidak ada' : null),
		}
		expect(findInOtherTabs(ctx, 'Metode')).toBeNull()
	})

	test('mengembalikan tab pertama yang cocok', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
				{ id: 'c', label: 'Bab 3', active: false },
			],
			readTab: (id: string) => (id === 'c' ? 'ada Metode' : id === 'b' ? 'ada Metode juga' : null),
		}
		expect(findInOtherTabs(ctx, 'Metode')).toEqual({ id: 'b', label: 'Bab 2' })
	})
})