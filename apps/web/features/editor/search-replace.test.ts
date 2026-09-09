import { describe, expect, test } from 'bun:test'
import { Schema } from '@tiptap/pm/model'
import {
	buildSearchRegex,
	collectResults,
	DEFAULT_SEARCH_MODIFIERS,
	foldDiacritics,
	replacementFor,
	type SearchModifiers,
} from './search-replace'

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'text*' },
		text: {},
	},
})

const docOf = (...paragraphs: string[]) =>
	schema.node(
		'doc',
		null,
		paragraphs.map((text) => schema.node('paragraph', null, text ? [schema.text(text)] : [])),
	)

const mods = (patch: Partial<SearchModifiers> = {}): SearchModifiers => ({
	...DEFAULT_SEARCH_MODIFIERS,
	...patch,
})

const matchesIn = (text: string, modifiers: SearchModifiers, term: string) => {
	const regex = buildSearchRegex(term, modifiers)
	if (!regex) return null
	return collectResults(docOf(text), regex, modifiers.ignoreDiacritics).map((result) => result.text)
}

describe('buildSearchRegex', () => {
	test('mode biasa memperlakukan pola sebagai teks apa adanya', () => {
		expect(matchesIn('harga 2+2 naik', mods(), '2+2')).toEqual(['2+2'])
	})

	test('mode regex membuka metakarakter', () => {
		expect(matchesIn('bab 1 dan bab 12', mods({ regex: true }), 'bab \\d+')).toEqual(['bab 1', 'bab 12'])
	})

	test('pola regex yang tidak sah menghasilkan null, bukan lemparan', () => {
		expect(buildSearchRegex('(', mods({ regex: true }))).toBeNull()
	})

	test('pola yang hanya sah tanpa flag u tetap dikompilasi', () => {
		const regex = buildSearchRegex('a\\-b', mods({ regex: true }))
		expect(regex).not.toBeNull()
		expect(regex?.unicode).toBe(false)
	})

	test('huruf besar/kecil dibedakan hanya kalau diminta', () => {
		expect(matchesIn('Bab bab', mods(), 'bab')).toEqual(['Bab', 'bab'])
		expect(matchesIn('Bab bab', mods({ caseSensitive: true }), 'bab')).toEqual(['bab'])
	})

	test('kata utuh menolak potongan di tengah kata', () => {
		expect(matchesIn('ada dan adalah', mods({ wholeWord: true }), 'ada')).toEqual(['ada'])
	})

	test('kata utuh ikut menghormati batas huruf beraksen', () => {
		expect(matchesIn('café cafétaria', mods({ wholeWord: true }), 'café')).toEqual(['café'])
	})
})

describe('foldDiacritics', () => {
	test('melipat aksen tanpa mengubah panjang string', () => {
		const source = 'Éä çÑ'
		const folded = foldDiacritics(source)
		expect(folded).toBe('Ea cN')
		expect(folded.length).toBe(source.length)
	})

	test('tanda gabung yang berdiri sendiri dibiarkan utuh', () => {
		const source = 'á'
		expect(foldDiacritics(source)).toBe(source)
	})

	test('posisi hasil tetap menunjuk teks aslinya', () => {
		const regex = buildSearchRegex('cafe', mods({ ignoreDiacritics: true }))
		if (!regex) throw new Error('pola gagal dikompilasi')
		const results = collectResults(docOf('kata café di sini'), regex, true)
		expect(results).toHaveLength(1)
		expect(results[0].text).toBe('café')
		expect(results[0].to - results[0].from).toBe(4)
	})
})

describe('replacementFor', () => {
	test('mode biasa memakai teks ganti apa adanya, termasuk tanda dolar', () => {
		expect(replacementFor('harga', 'harga', 'Rp$1', mods())).toBe('Rp$1')
	})

	test('mode regex menghormati grup tangkapan', () => {
		expect(replacementFor('bab 12', '(bab) (\\d+)', '$2 - $1', mods({ regex: true }))).toBe('12 - bab')
	})

	test('pola tidak sah tidak merusak teks ganti', () => {
		expect(replacementFor('bab', '(', 'X', mods({ regex: true }))).toBe('X')
	})
})

describe('collectResults', () => {
	test('cocok sepanjang nol dilewati, bukan menghentikan pencarian', () => {
		expect(matchesIn('aa ba', mods({ regex: true }), 'b*')).toEqual(['b'])
	})

	test('hasil tersusun urut sesuai posisi dokumen', () => {
		const regex = buildSearchRegex('bab', mods())
		if (!regex) throw new Error('pola gagal dikompilasi')
		const results = collectResults(docOf('bab satu', 'bab dua'), regex, false)
		expect(results.map((result) => result.from)).toEqual([1, 11])
	})
})
