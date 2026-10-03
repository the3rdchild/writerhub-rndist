import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { buildSchema } from '@/features/sync/serialize'
import { captionAfterImage, imageFilesOf, nextFigureNumber } from './image-insert'

const image: JSONContent = { type: 'image', attrs: { src: 'data:image/png;base64,AA==' } }
const caption = (text: string, level = 7): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }],
})
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })

function docOf(...content: JSONContent[]) {
	return buildSchema().nodeFromJSON({ type: 'doc', content })
}

/** Posisi gambar ke-`index` di dokumen. */
function imagePos(doc: ReturnType<typeof docOf>, index: number): number {
	const found: number[] = []
	doc.descendants((node, pos) => {
		if (node.type.name === 'image') found.push(pos)
	})
	return found[index]
}

describe('imageFilesOf', () => {
	test('hanya berkas gambar yang diambil', () => {
		const files = [
			new File(['a'], 'a.png', { type: 'image/png' }),
			new File(['b'], 'b.txt', { type: 'text/plain' }),
			new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
		]
		const picked = imageFilesOf({ files } as unknown as DataTransfer)
		expect(picked.map((file) => file.name)).toEqual(['a.png', 'c.jpg'])
		expect(imageFilesOf(null)).toEqual([])
	})
})

describe('keterangan gambar', () => {
	test('nomor berikutnya menghitung keterangan gambar sebelumnya saja', () => {
		const doc = docOf(
			image,
			caption('Gambar 1. Pertama'),
			caption('Tabel 1. Bukan gambar'),
			paragraph('Gambar ini bukan keterangan karena paragraf'),
			image,
			caption('Gambar 2. Kedua'),
			image,
		)
		expect(nextFigureNumber(doc, imagePos(doc, 0))).toBe(1)
		expect(nextFigureNumber(doc, imagePos(doc, 1))).toBe(2)
		expect(nextFigureNumber(doc, imagePos(doc, 2))).toBe(3)
	})

	test('keterangan tepat sesudah gambar dikenali, judul biasa tidak', () => {
		const doc = docOf(image, caption('Gambar 1. Ada'), image, caption('Bab dua', 2), image)
		expect(captionAfterImage(doc, imagePos(doc, 0))?.node.textContent).toBe('Gambar 1. Ada')
		expect(captionAfterImage(doc, imagePos(doc, 1))).toBeNull()
		expect(captionAfterImage(doc, imagePos(doc, 2))).toBeNull()
	})

	test('keterangan tingkat 8 dan 9 juga dihitung', () => {
		const doc = docOf(image, caption('Gambar 1.1 Sub', 8), image, caption('Fig. 2 Inggris', 9), image)
		expect(nextFigureNumber(doc, imagePos(doc, 2))).toBe(3)
	})
})
