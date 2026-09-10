import { describe, expect, test } from 'bun:test'
import type { TemplateMetadataField } from '@writer-hub/shared'
import { applyTemplateMetadata } from './metadata'

const fields: TemplateMetadataField[] = [
	{ key: 'judul', label: 'Judul', placeholder: 'Judul Skripsi' },
	{ key: 'nama', label: 'Nama', placeholder: 'Nama Mahasiswa' },
	{ key: 'nim', label: 'NIM', placeholder: '1234567890' },
]

const doc = (...texts: string[]) => ({
	type: 'doc',
	content: texts.map((text) => ({
		type: 'paragraph',
		content: [{ type: 'text', text }],
	})),
})

const textsOf = (node: Record<string, unknown>): string[] => {
	const out: string[] = []
	const walk = (value: unknown) => {
		if (Array.isArray(value)) return value.forEach(walk)
		if (!value || typeof value !== 'object') return
		const record = value as Record<string, unknown>
		if (typeof record.text === 'string') out.push(record.text)
		for (const child of Object.values(record)) walk(child)
	}
	walk(node)
	return out
}

describe('applyTemplateMetadata', () => {
	test('teks contoh diganti nilai yang diisi', () => {
		const result = applyTemplateMetadata(doc('Judul Skripsi'), fields, {
			judul: 'Prediksi Kualitas Uap Panas Bumi',
		})

		expect(textsOf(result)).toEqual(['Prediksi Kualitas Uap Panas Bumi'])
	})

	test('isian yang dilewatkan menyisakan teks contohnya - ia masih memberi petunjuk', () => {
		const result = applyTemplateMetadata(doc('Judul Skripsi', 'Nama Mahasiswa'), fields, {
			judul: 'Rancang Bangun',
		})

		expect(textsOf(result)).toEqual(['Rancang Bangun', 'Nama Mahasiswa'])
	})

	test('nilai berisi spasi saja dianggap tidak diisi', () => {
		const result = applyTemplateMetadata(doc('Judul Skripsi'), fields, { judul: '   ' })

		expect(textsOf(result)).toEqual(['Judul Skripsi'])
	})

	test('pengganti hanya menyentuh potongan teksnya, bukan seluruh paragraf', () => {
		const result = applyTemplateMetadata(doc('Nama Mahasiswa - NIM 1234567890'), fields, {
			nama: 'Naufal Kholis Arrahman',
			nim: '140910220010',
		})

		expect(textsOf(result)).toEqual(['Naufal Kholis Arrahman - NIM 140910220010'])
	})

	test('teks contoh yang menjadi awalan teks contoh lain tidak memakannya duluan', () => {
		const overlapping: TemplateMetadataField[] = [
			{ key: 'a', label: 'Pendek', placeholder: 'Judul' },
			{ key: 'b', label: 'Panjang', placeholder: 'Judul Skripsi' },
		]
		const result = applyTemplateMetadata(doc('Judul Skripsi'), overlapping, {
			a: 'X',
			b: 'Skripsi Saya',
		})

		expect(textsOf(result)).toEqual(['Skripsi Saya'])
	})

	test('struktur dan tanda format tidak tersentuh', () => {
		const source = {
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Judul Skripsi' }],
				},
			],
		}
		const result = applyTemplateMetadata(source, fields, { judul: 'Ganti' })

		expect(result).toEqual({
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Ganti' }],
				},
			],
		})
	})

	test('tanpa metadata maupun isian, kerangkanya dikembalikan apa adanya', () => {
		const source = doc('Judul Skripsi')

		expect(applyTemplateMetadata(source, fields, undefined)).toBe(source)
		expect(applyTemplateMetadata(source, undefined, { judul: 'X' })).toBe(source)
		expect(applyTemplateMetadata(source, fields, {})).toBe(source)
	})
})
