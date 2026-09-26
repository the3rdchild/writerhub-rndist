import { describe, expect, test } from 'bun:test'
import { decodeEntities, protectEscapes, restoreEscapes, startsEntity } from './markdown-text'

describe('entitas HTML', () => {
	test('entitas bernama, desimal, dan heksadesimal diterjemahkan', () => {
		expect(decodeEntities('A&emsp;B&nbsp;C')).toBe('A B C')
		expect(decodeEntities('&#8212; &#x2014;')).toBe('— —')
		expect(decodeEntities('&lt;b&gt; &amp;')).toBe('<b> &')
	})

	test('yang tidak dikenal atau tidak sah dibiarkan apa adanya', () => {
		expect(decodeEntities('&bukanentitas; &#0; &#xD800; &')).toBe('&bukanentitas; &#0; &#xD800; &')
	})

	test('awal entitas dikenali per posisi', () => {
		expect(startsEntity('a &emsp; b', 2)).toBe(true)
		expect(startsEntity('R&D', 1)).toBe(false)
		expect(startsEntity('&amp', 0)).toBe(false)
	})
})

describe('backslash-escape', () => {
	test('diamankan lalu kembali menjadi karakternya', () => {
		const guarded = protectEscapes('( \\_\\_\\_ ) \\*bukan miring\\*')
		expect(guarded).not.toContain('_')
		expect(guarded).not.toContain('*')
		expect(restoreEscapes(guarded)).toBe('( ___ ) *bukan miring*')
	})

	test('pembatas rumus dan backslash ganda tidak disentuh', () => {
		expect(protectEscapes('\\(x\\) \\[y\\] a \\\\ b \\frac{1}{2}')).toBe(
			'\\(x\\) \\[y\\] a \\\\ b \\frac{1}{2}',
		)
	})

	test('bisa dibatasi ke sebagian tanda baca, dan dikembalikan dalam bentuk lain', () => {
		const guarded = protectEscapes('\\$5 \\_', '$')
		expect(guarded).toContain('\\_')
		expect(restoreEscapes(guarded, (char) => `\\${char}`)).toBe('\\$5 \\_')
	})
})
