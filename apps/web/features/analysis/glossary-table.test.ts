import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { buildEditorExtensions } from '@/features/editor/extensions'
import {
	buildGlossarySection,
	findGlossarySection,
	GLOSSARY_HEADING,
	glossaryTermLabel,
} from './glossary-table'

const schema = getSchema(buildEditorExtensions())

const entries = [
	{ term: 'AKD', definition: 'Analisis Komponen Data', occurrences: 3 },
	{ term: 'latensi', definition: 'Jeda antara permintaan dan respons', occurrences: 2 },
]

/** Rakit dokumen dari daftar node, lewat skema editor sungguhan. */
const docOf = (content: unknown[]) => schema.nodeFromJSON({ type: 'doc', content })

const paragraph = (text: string) => ({
	type: 'paragraph',
	content: [{ type: 'text', text }],
})

describe('label kolom Istilah', () => {
	test('singkatan ditulis bersama kepanjangannya', () => {
		expect(
			glossaryTermLabel({
				term: 'DCS',
				expansion: 'Distributed Control System',
				definition: '…',
				occurrences: 3,
			}),
		).toBe('DCS (Distributed Control System)')
	})

	test('tanpa kepanjangan, istilahnya berdiri sendiri', () => {
		expect(glossaryTermLabel({ term: 'latensi', definition: '…', occurrences: 2 })).toBe('latensi')
	})

	test('kepanjangan kosong atau berisi spasi diperlakukan sebagai tidak ada', () => {
		// Model kadang mengisi "" atau " " alih-alih menghilangkan fieldnya;
		// keduanya tidak boleh menghasilkan kurung kosong di tabel.
		expect(glossaryTermLabel({ term: 'AKD', expansion: '', definition: '…', occurrences: 1 })).toBe(
			'AKD',
		)
		expect(
			glossaryTermLabel({ term: 'AKD', expansion: '   ', definition: '…', occurrences: 1 }),
		).toBe('AKD')
	})
})

describe('perakitan tabel glosarium', () => {
	test('sel Istilah memuat kepanjangan bila ada', () => {
		const [, table] = buildGlossarySection([
			{ term: 'DCS', expansion: 'Distributed Control System', definition: 'Sistem kendali', occurrences: 3 },
		])
		const firstCell = table.content?.[1]?.content?.[0]
		expect(firstCell?.content?.[0]?.content?.[0]?.text).toBe('DCS (Distributed Control System)')
	})

	test('menghasilkan heading lalu tabel dua kolom', () => {
		const [heading, table] = buildGlossarySection(entries)
		expect(heading.type).toBe('heading')
		expect(heading.content?.[0]?.text).toBe(GLOSSARY_HEADING)
		expect(table.type).toBe('table')
	})

	test('baris pertama adalah kepala tabel, sisanya satu per istilah', () => {
		const [, table] = buildGlossarySection(entries)
		const rows = table.content ?? []
		expect(rows).toHaveLength(entries.length + 1)
		expect(rows[0]?.content?.[0]?.type).toBe('tableHeader')
		expect(rows[1]?.content?.[0]?.type).toBe('tableCell')
	})

	test('hasilnya diterima skema editor', () => {
		// Node yang tidak sah baru meledak saat disisipkan ke dokumen sungguhan;
		// diuji di sini supaya tidak lolos sampai ke naskah pengguna.
		expect(() => docOf(buildGlossarySection(entries))).not.toThrow()
	})

	test('daftar kosong tetap menghasilkan tabel yang sah (hanya kepalanya)', () => {
		expect(() => docOf(buildGlossarySection([]))).not.toThrow()
	})
})

describe('pencarian bagian glosarium yang sudah ada', () => {
	test('null pada dokumen tanpa glosarium', () => {
		expect(findGlossarySection(docOf([paragraph('Naskah biasa saja.')]))).toBeNull()
	})

	test('menemukan heading Glosarium yang diikuti tabel', () => {
		const doc = docOf([paragraph('Pembuka.'), ...buildGlossarySection(entries)])
		const found = findGlossarySection(doc)
		expect(found).not.toBeNull()
		// Rentangnya harus mulai TEPAT di heading, bukan di paragraf pembuka.
		expect(found?.from).toBe(doc.child(0).nodeSize)
	})

	test('heading Glosarium tanpa tabel TIDAK diklaim', () => {
		// Tulisan pengguna sendiri: judul "Glosarium" lalu paragraf biasa.
		// Menimpanya berarti menghapus naskah yang bukan buatan fitur ini.
		const doc = docOf([
			{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Glosarium' }] },
			paragraph('Daftar istilah saya tulis manual di sini.'),
		])
		expect(findGlossarySection(doc)).toBeNull()
	})

	test('heading lain yang diikuti tabel tidak diklaim', () => {
		const doc = docOf([
			{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Lampiran' }] },
			buildGlossarySection(entries)[1],
		])
		expect(findGlossarySection(doc)).toBeNull()
	})
})
