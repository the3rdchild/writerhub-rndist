import { describe, expect, test } from 'bun:test'
import { extractSvg, structuralProblems, svgReceipt, viewBoxSize } from './svg-output'

const GOOD =
	'<svg viewBox="0 0 1000 480" xmlns="http://www.w3.org/2000/svg">' +
	'<title>Alur redaksi</title><desc>Naskah bergerak dari reporter ke editor.</desc>' +
	'<rect x="10" y="10" width="100" height="40" fill="#f5f5f5"/></svg>'

describe('memotong jawaban model', () => {
	test('mengabaikan basa-basi dan pagar di sekitarnya', () => {
		const answer = 'Tentu, ini diagramnya:\n\n```svg\n' + GOOD + '\n```\n\nSemoga membantu.'
		expect(extractSvg(answer)).toBe(GOOD)
	})

	test('jawaban tanpa svg sama sekali', () => {
		expect(extractSvg('Maaf, saya tidak bisa menggambar itu.')).toBeNull()
	})
})

describe('ukuran dari viewBox', () => {
	test('dibaca dari dua angka terakhir', () => {
		expect(viewBoxSize(GOOD)).toEqual({ width: 1000, height: 480 })
	})

	test('viewBox nol atau hilang tidak dipakai', () => {
		expect(viewBoxSize('<svg viewBox="0 0 0 480"></svg>')).toBeNull()
		expect(viewBoxSize('<svg></svg>')).toBeNull()
	})
})

describe('keluhan yang dikirim balik ke model', () => {
	test('gambar yang benar tidak menghasilkan keluhan', () => {
		expect(structuralProblems(GOOD)).toEqual([])
	})

	test('lebih tinggi daripada lebar - terpotong di tepi kertas', () => {
		const tall = GOOD.replace('0 0 1000 480', '0 0 480 1000')
		expect(structuralProblems(tall).join(' ')).toContain('taller')
	})

	/*
	 * Keluhannya harus terbaca sebagai kalimat, bukan sebagai kode galat: model
	 * yang diberi tahu "a <style> element" memperbaikinya, sementara model yang
	 * diberi tahu "invalid" mengarang ulang dari nol.
	 */
	test('bentuk terlarang disebut dengan namanya', () => {
		expect(structuralProblems(GOOD.replace('<rect', '<style>x{}</style><rect')).join(' ')).toContain(
			'<style>',
		)
		expect(structuralProblems(GOOD.replace('<rect', '<rect onload="x()"')).join(' ')).toContain(
			'event handler',
		)
	})

	test('rujukan ke luar berkas ditangkap, rujukan ke dalam tidak', () => {
		expect(structuralProblems(GOOD.replace('#f5f5f5', 'url(https://a.test/x.svg#p)')).join(' ')).toContain(
			'url()',
		)
		expect(structuralProblems(GOOD.replace('#f5f5f5', 'url(#dots)'))).toEqual([])
	})

	test('judul dan deskripsi yang hilang diminta', () => {
		const bare = '<svg viewBox="0 0 1000 480"><rect/></svg>'
		expect(structuralProblems(bare).join(' ')).toContain('<title>')
		expect(structuralProblems(bare).join(' ')).toContain('<desc>')
	})
})

describe('tanda terima', () => {
	/*
	 * Model utama tidak pernah melihat SVG-nya, jadi satu-satunya cara ia bisa
	 * menyadari sub-agent salah paham adalah membaca apa yang benar-benar
	 * digambar - bukan mengulang permintaannya sendiri.
	 */
	test('judul dan deskripsi diambil dari gambarnya, bukan dari permintaan', () => {
		expect(svgReceipt(GOOD)).toEqual({
			title: 'Alur redaksi',
			desc: 'Naskah bergerak dari reporter ke editor.',
			size: { width: 1000, height: 480 },
		})
	})
})
