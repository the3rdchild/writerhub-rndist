import { describe, expect, test } from 'bun:test'
import { chartProblems } from './chart-check'

function bars(pairs: Array<[value: number, height: number]>): string {
	return `<svg>${pairs
		.map(([value, height]) => `<rect data-value="${value}" height="${height}" width="72"/>`)
		.join('')}</svg>`
}

describe('batang harus mewakili angkanya', () => {
	/*
	 * Kenapa ini penjagaan terpenting di seluruh berkas diagram: chart yang
	 * salah skala tidak terlihat salah. Batangnya rapi, sumbunya lurus,
	 * labelnya benar - yang salah cuma tingginya, dan itu data yang salah di
	 * naskah orang dengan tampilan yang meyakinkan.
	 */
	test('skala yang konsisten lolos', () => {
		expect(
			chartProblems(
				bars([
					[100, 50],
					[200, 100],
					[50, 25],
				]),
				'bar',
			),
		).toEqual([])
	})

	test('satu batang di luar skala ditangkap', () => {
		const problems = chartProblems(
			bars([
				[100, 50],
				[200, 100],
				[300, 90],
			]),
			'bar',
		)
		expect(problems.join(' ')).toContain('do not match the numbers')
	})

	test('pembulatan piksel bukan kesalahan', () => {
		expect(
			chartProblems(
				bars([
					[100, 50],
					[301, 150],
				]),
				'bar',
			),
		).toEqual([])
	})

	test('satu batang saja tidak bisa dibandingkan dengan apa pun', () => {
		expect(chartProblems(bars([[100, 50]]), 'bar')).toEqual([])
	})
})

describe('titik harus berada di satu skala', () => {
	function points(pairs: Array<[value: number, cy: number]>): string {
		return `<svg>${pairs.map(([value, cy]) => `<circle data-value="${value}" cy="${cy}" r="4"/>`).join('')}</svg>`
	}

	test('langkah nilai yang sama berjarak sama', () => {
		expect(
			chartProblems(
				points([
					[10, 400],
					[20, 300],
					[30, 200],
				]),
				'line',
			),
		).toEqual([])
	})

	test('titik yang ditaruh dengan mata ditangkap', () => {
		const problems = chartProblems(
			points([
				[10, 400],
				[20, 300],
				[30, 120],
			]),
			'line',
		)
		expect(problems.join(' ')).toContain('not on one scale')
	})
})

describe('batas pemeriksaannya', () => {
	/*
	 * Ketiadaan data-value itu sendiri adalah keluhan: tanpa angka aslinya tidak
	 * ada satu pun cara memeriksa bahwa gambarnya mewakili datanya.
	 */
	test('chart tanpa data-value ditolak', () => {
		expect(chartProblems('<svg><rect height="50"/></svg>', 'bar').join(' ')).toContain('no data-value')
	})

	test('tipe struktural tidak diperiksa - ia memang tidak punya angka', () => {
		expect(chartProblems('<svg><rect height="50"/></svg>', 'flowchart')).toEqual([])
		expect(chartProblems('<svg><rect height="50"/></svg>', 'architecture')).toEqual([])
	})
})
