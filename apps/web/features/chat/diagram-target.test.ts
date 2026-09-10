import { describe, expect, test } from 'bun:test'
import { type DiagramBlock, findDiagramBlock } from './diagram-target'

function block(title: string, pos = 0): DiagramBlock {
	return { pos, title, source: `<svg><title>${title}</title></svg>` }
}

describe('memilih diagram yang akan ditimpa', () => {
	test('tanpa judul, satu-satunya diagram adalah pilihan yang jelas', () => {
		expect(findDiagramBlock([block('Alur redaksi')])?.title).toBe('Alur redaksi')
	})

	/*
	 * Menimpa diagram yang salah jauh lebih mahal daripada meminta penulis
	 * menyebut yang mana - jadi ambiguitas berakhir tanpa pilihan, bukan dengan
	 * tebakan.
	 */
	test('beberapa diagram tanpa judul: tidak ada yang dipilih', () => {
		expect(findDiagramBlock([block('Alur redaksi'), block('Arsitektur', 10)])).toBeNull()
	})

	test('judul persis dipakai', () => {
		const blocks = [block('Alur redaksi'), block('Arsitektur', 10)]
		expect(findDiagramBlock(blocks, 'Arsitektur')?.pos).toBe(10)
	})

	test('judul sebagian cukup selama hanya satu yang cocok', () => {
		const blocks = [block('Alur penerbitan berita'), block('Arsitektur sistem', 10)]
		expect(findDiagramBlock(blocks, 'penerbitan')?.pos).toBe(0)
	})

	test('judul sebagian yang cocok ke beberapa tidak memilih apa pun', () => {
		const blocks = [block('Alur redaksi pagi'), block('Alur redaksi sore', 10)]
		expect(findDiagramBlock(blocks, 'Alur redaksi')).toBeNull()
	})

	test('besar-kecil huruf tidak menentukan', () => {
		expect(findDiagramBlock([block('Alur Redaksi'), block('Lain', 10)], 'alur redaksi')?.pos).toBe(0)
	})

	test('dokumen tanpa diagram', () => {
		expect(findDiagramBlock([], 'apa pun')).toBeNull()
	})
})
