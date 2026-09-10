import { describe, expect, test } from 'bun:test'
import { placeholderIds, stitchDiagrams } from './diagram-embed'

describe('penanda diagram di dalam rancangan', () => {
	test('id dikumpulkan apa adanya', () => {
		expect(placeholderIds('<div><!--diagram:tren--><p>x</p><!-- diagram:pangsa --></div>')).toEqual([
			'tren',
			'pangsa',
		])
	})

	test('markup tanpa penanda tidak menghasilkan apa-apa', () => {
		expect(placeholderIds('<div>tanpa gambar</div>')).toEqual([])
	})
})

describe('menanam gambar', () => {
	test('penanda diganti gambarnya', () => {
		const result = stitchDiagrams('<div><!--diagram:tren--></div>', new Map([['tren', '<svg id="a"/>']]))
		expect(result.html).toBe('<div><svg id="a"/></div>')
		expect(result.missing).toEqual([])
	})

	/*
	 * Penanda yang tidak punya gambar dibiarkan utuh, bukan dihapus: komentar
	 * HTML tidak merusak rancangan, sementara penghapusan diam-diam membuat
	 * bagan yang gagal digambar tampak seperti bagan yang memang tidak diminta.
	 */
	test('penanda tanpa gambar dilaporkan dan dibiarkan', () => {
		const result = stitchDiagrams('<div><!--diagram:tren--></div>', new Map())
		expect(result.missing).toEqual(['tren'])
		expect(result.html).toContain('<!--diagram:tren-->')
	})

	test('besar-kecil huruf id tidak menentukan', () => {
		const result = stitchDiagrams('<!--diagram:Tren-->', new Map([['tren', '<svg/>']]))
		expect(result.html).toBe('<svg/>')
	})

	test('beberapa penanda, masing-masing gambarnya sendiri', () => {
		const drawn = new Map([
			['a', '<svg id="a"/>'],
			['b', '<svg id="b"/>'],
		])
		expect(stitchDiagrams('<!--diagram:a--><!--diagram:b-->', drawn).html).toBe('<svg id="a"/><svg id="b"/>')
	})
})
