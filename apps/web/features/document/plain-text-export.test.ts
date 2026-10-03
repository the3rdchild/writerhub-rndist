import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { buildSchema } from '@/features/sync/serialize'
import { plainTextOf, plainTextOfTabs } from './plain-text-export'

const docOf = (...content: JSONContent[]) => buildSchema().nodeFromJSON({ type: 'doc', content })
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const t = (text: string): JSONContent => ({ type: 'text', text })
const emptyCell: JSONContent = { type: 'tableCell', content: [{ type: 'paragraph' }] }
const emptyRow: JSONContent = { type: 'tableRow', content: [emptyCell, emptyCell, emptyCell] }

describe('ekspor teks polos (SHL-19)', () => {
	test('tabel kosong tidak menyisakan deretan baris kosong', () => {
		const doc = docOf(
			p(t('Sebelum')),
			{ type: 'table', content: [emptyRow, emptyRow, emptyRow] },
			p(t('Sesudah')),
		)
		expect(plainTextOf(doc)).toBe('Sebelum\n\nSesudah')
	})

	test('rujukan catatan kaki menjadi [n] dan catatannya di akhir', () => {
		const doc = docOf(
			p(
				t('Kalimat'),
				{ type: 'footnoteRef', attrs: { id: 'a', content: [t('Catatan satu')] } },
				t(' lanjut.'),
			),
			p({ type: 'mathInline', attrs: { latex: 'E=mc^2' } }),
		)
		expect(plainTextOf(doc)).toBe('Kalimat[1] lanjut.\n$E=mc^2$\n\n[1] Catatan satu')
	})

	test('beberapa tab dibuka dengan judulnya', () => {
		const text = plainTextOfTabs([
			{ title: 'Bab 1', doc: docOf(p(t('Satu'))) },
			{ title: 'Bab 2', doc: docOf(p(t('Dua'))) },
		])
		expect(text).toBe('Bab 1\n=====\n\nSatu\n\n\nBab 2\n=====\n\nDua\n')
		expect(plainTextOfTabs([{ title: 'Tunggal', doc: docOf(p(t('Isi'))) }])).toBe('Isi\n')
	})
})
