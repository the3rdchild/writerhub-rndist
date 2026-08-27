import { describe, expect, test } from 'bun:test'
import { resolveTitle } from './title-sync'

const side = (title: string, titleUpdatedAt = 0) => ({ title, titleUpdatedAt })

describe('penyelarasan judul dokumen', () => {
	test('judul sama: tidak ada yang perlu dikerjakan', () => {
		expect(resolveTitle(side('Bab 1'), side('Bab 1'), 'Bab 1')).toBe('none')
	})

	test('hanya server bergeser dari base: judul server diadopsi', () => {
		expect(resolveTitle(side('Untitled document'), side('Bab 1'), 'Untitled document')).toBe('adopt-server')
	})

	test('server menang meski lokal baru saja disunting', () => {
		expect(resolveTitle(side('Untitled document', 0), side('Bab 1', 5), 'Untitled document')).toBe(
			'adopt-server',
		)
	})

	test('hanya lokal bergeser: judul lokal dikirim', () => {
		expect(resolveTitle(side('Bab 1 (revisi)'), side('Bab 1'), 'Bab 1')).toBe('push-local')
	})

	test('bentrok: rename terbaru yang menang', () => {
		expect(resolveTitle(side('Dari laptop', 100), side('Dari ponsel', 200), 'Lama')).toBe('adopt-server')
		expect(resolveTitle(side('Dari laptop', 300), side('Dari ponsel', 200), 'Lama')).toBe('push-local')
	})

	test('bentrok dengan stempel waktu seri dimenangkan lokal', () => {
		expect(resolveTitle(side('Lokal', 500), side('Server', 500), 'Lama')).toBe('push-local')
	})

	test('tanpa base (belum pernah tersinkron) diperlakukan sebagai bentrok', () => {
		expect(resolveTitle(side('Lokal', 1), side('Server', 2), undefined)).toBe('adopt-server')
		expect(resolveTitle(side('Lokal', 3), side('Server', 2), undefined)).toBe('push-local')
	})
})
