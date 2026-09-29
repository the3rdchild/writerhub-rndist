import { describe, expect, test } from 'bun:test'
import { type DocumentTypography, EMPTY_BRIEF, type PageSetup, type ResearchBrief } from '@writer-hub/shared'
import {
	applyFormatTarget,
	cmToPx,
	fontFamilyOf,
	formatDifferences,
	formatTarget,
	parseBriefNumber,
	pxToCm,
} from './format-apply'

const letter: PageSetup = {
	size: 'letter',
	orientation: 'portrait',
	margins: { top: 96, right: 96, bottom: 96, left: 96 },
	pageColor: null,
	pageless: false,
}
const plain: DocumentTypography = {
	baseFont: { family: 'Arial, Helvetica, sans-serif', sizePt: 11 },
	lineHeight: 1,
}

const rules = (entries: Record<string, string>): ResearchBrief => ({
	...EMPTY_BRIEF,
	entries: Object.fromEntries(
		Object.entries(entries).map(([key, value]) => [key, { value, source: 'user', at: 1 }]),
	),
})

const skripsi = rules({
	kertas: 'A4',
	marginKiri: '4',
	marginAtas: '3',
	marginKanan: '3',
	marginBawah: '3',
	font: 'Times New Roman',
	ukuranFont: '12',
	spasi: '1,5',
	sitasi: 'APA 7',
})

test('angka ditulis seperti penulis mengetiknya', () => {
	expect(parseBriefNumber('4')).toBe(4)
	expect(parseBriefNumber('1,5')).toBe(1.5)
	expect(parseBriefNumber('3 cm')).toBe(3)
	expect(parseBriefNumber('tidak ada')).toBeNull()
	expect(parseBriefNumber(undefined)).toBeNull()
})

test('huruf dari katalog memakai nilai katalognya; yang lain dicoba lewat namanya', () => {
	expect(fontFamilyOf('times new roman')).toBe('"Times New Roman", Times, serif')
	expect(fontFamilyOf('Calibri')).toBe('"Calibri", serif')
})

describe('aturan kampus ke tata letak', () => {
	test('sasaran hanya memuat yang diatur', () => {
		expect(formatTarget(rules({ sitasi: 'APA 7' }))).toEqual({})
		const target = formatTarget(skripsi)
		expect(target.size).toBe('a4')
		expect(target.margins?.left).toBeCloseTo(cmToPx(4))
		expect(target.sizePt).toBe(12)
		expect(target.lineHeight).toBe(1.5)
	})

	test('angka yang tidak masuk akal diabaikan, bukan diterapkan', () => {
		expect(formatTarget(rules({ marginKiri: '40', ukuranFont: '500', spasi: '9' }))).toEqual({})
	})

	test('perbedaan dilaporkan dalam satuan penulis', () => {
		const differences = formatDifferences(formatTarget(skripsi), letter, plain)
		expect(differences.map((item) => item.key)).toEqual([
			'size',
			'left',
			'top',
			'right',
			'bottom',
			'family',
			'sizePt',
			'lineHeight',
		])
		expect(differences.find((item) => item.key === 'left')).toMatchObject({
			current: '2,54 cm',
			wanted: '4 cm',
		})
		expect(differences.find((item) => item.key === 'lineHeight')).toMatchObject({
			current: '1',
			wanted: '1,5',
		})
	})

	test('sesudah diterapkan tidak ada lagi perbedaan, dan yang tidak diatur tetap', () => {
		const target = formatTarget(skripsi)
		const applied = applyFormatTarget(target, letter, plain)
		expect(formatDifferences(target, applied.setup, applied.typography)).toEqual([])
		expect(applied.setup.orientation).toBe('portrait')
	})

	test('margin yang berbeda karena pembulatan dianggap sama', () => {
		const target = formatTarget(rules({ marginKiri: '4' }))
		const setup = { ...letter, margins: { ...letter.margins, left: 150 } }
		expect(pxToCm(150)).toBe(3.97)
		expect(formatDifferences(target, setup, plain)).toEqual([])
	})
})
