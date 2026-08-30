import { describe, expect, test } from 'bun:test'
import { createExternalDocumentBodySchema } from './dto'

const dasar = { title: 'Draf Akademik' }

describe('validasi body dokumen eksternal', () => {
	test('mode markdown diterima', () => {
		const hasil = createExternalDocumentBodySchema.safeParse({ ...dasar, markdown: '# Judul\nIsi.' })
		expect(hasil.success).toBe(true)
	})

	test('mode prompt diterima, termasuk tone yang sah', () => {
		const hasil = createExternalDocumentBodySchema.safeParse({
			...dasar,
			prompt: 'Buatkan draf akademik tentang kopi',
			tone: 'academic',
		})
		expect(hasil.success).toBe(true)
	})

	test('markdown dan prompt bersamaan ditolak', () => {
		const hasil = createExternalDocumentBodySchema.safeParse({ ...dasar, markdown: 'x', prompt: 'y' })
		expect(hasil.success).toBe(false)
	})

	test('tanpa markdown maupun prompt ditolak', () => {
		expect(createExternalDocumentBodySchema.safeParse(dasar).success).toBe(false)
	})

	test('judul kosong ditolak', () => {
		const hasil = createExternalDocumentBodySchema.safeParse({ title: '', markdown: 'x' })
		expect(hasil.success).toBe(false)
	})

	test('tone di luar daftar REWRITE_TONE_IDS ditolak', () => {
		const hasil = createExternalDocumentBodySchema.safeParse({ ...dasar, prompt: 'x', tone: 'puitis' })
		expect(hasil.success).toBe(false)
	})
})
