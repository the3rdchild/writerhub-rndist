import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { buildSchema } from '@/features/sync/serialize'
import {
	collectImageSources,
	imageBox,
	imageLabel,
	intrinsicSize,
	loadExportImage,
	sniffImage,
} from './export-images'

/** Berkas buatan secukupnya: hanya kepala yang dibaca pengurai ukuran. */
function bytes(length: number, write: (view: DataView, raw: Uint8Array) => void): Uint8Array {
	const raw = new Uint8Array(length)
	write(new DataView(raw.buffer), raw)
	return raw
}

const ascii = (raw: Uint8Array, at: number, text: string) => {
	for (let index = 0; index < text.length; index += 1) raw[at + index] = text.charCodeAt(index)
}

const PNG_640x480 = bytes(33, (view, raw) => {
	raw.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
	ascii(raw, 12, 'IHDR')
	view.setUint32(16, 640)
	view.setUint32(20, 480)
})

/* SOI, APP0 (JFIF, 16 bita) yang harus dilompati, lalu SOF2 (progresif). */
const JPEG_1024x768 = bytes(40, (view, raw) => {
	raw.set([0xff, 0xd8, 0xff, 0xe0])
	view.setUint16(4, 16)
	ascii(raw, 6, 'JFIF')
	raw.set([0xff, 0xc2], 20)
	view.setUint16(22, 17)
	raw[24] = 8
	view.setUint16(25, 768)
	view.setUint16(27, 1024)
})

const GIF_320x200 = bytes(13, (view, raw) => {
	ascii(raw, 0, 'GIF89a')
	view.setUint16(6, 320, true)
	view.setUint16(8, 200, true)
})

/* Tinggi negatif: baris disimpan dari atas. */
const BMP_800x600 = bytes(30, (view, raw) => {
	ascii(raw, 0, 'BM')
	view.setInt32(18, 800, true)
	view.setInt32(22, -600, true)
})

const WEBP = bytes(16, (_, raw) => {
	ascii(raw, 0, 'RIFF')
	ascii(raw, 8, 'WEBPVP8 ')
})

const PNG_1PX =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function base64(raw: Uint8Array): string {
	return btoa(String.fromCharCode(...raw))
}

describe('jenis dan ukuran dari kepala berkas', () => {
	test('jenis dikenali dari bita pembuka, bukan dari nama', () => {
		expect(sniffImage(PNG_640x480)).toBe('png')
		expect(sniffImage(JPEG_1024x768)).toBe('jpg')
		expect(sniffImage(GIF_320x200)).toBe('gif')
		expect(sniffImage(BMP_800x600)).toBe('bmp')
		expect(sniffImage(WEBP)).toBe('webp')
		expect(
			sniffImage(new TextEncoder().encode('<?xml version="1.0"?>\n<svg viewBox="0 0 10 10"></svg>')),
		).toBe('svg')
		expect(sniffImage(new TextEncoder().encode('<html>404</html>'))).toBe('other')
	})

	test('ukuran PNG, GIF, dan BMP dibaca dari tempat tetapnya', () => {
		expect(intrinsicSize(PNG_640x480, 'png')).toEqual({ width: 640, height: 480 })
		expect(intrinsicSize(GIF_320x200, 'gif')).toEqual({ width: 320, height: 200 })
		expect(intrinsicSize(BMP_800x600, 'bmp')).toEqual({ width: 800, height: 600 })
	})

	test('ukuran JPEG dicari di segmen SOF, melewati segmen sebelumnya', () => {
		expect(intrinsicSize(JPEG_1024x768, 'jpg')).toEqual({ width: 1024, height: 768 })
	})

	test('berkas terpotong tidak melempar galat', () => {
		expect(intrinsicSize(PNG_640x480.subarray(0, 18), 'png')).toBeNull()
		expect(intrinsicSize(JPEG_1024x768.subarray(0, 12), 'jpg')).toBeNull()
	})
})

describe('mengambil gambar', () => {
	afterEach(() => {
		mock.restore()
	})

	test('data URL dibaca langsung, tanpa jaringan', async () => {
		const fetchSpy = spyOn(globalThis, 'fetch')
		const image = await loadExportImage(PNG_1PX)

		expect(image).toMatchObject({ type: 'png', width: 1, height: 1 })
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	test('URL diambil, dan jenisnya dibaca dari isinya', async () => {
		spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JPEG_1024x768.slice()))
		const image = await loadExportImage('https://contoh.id/foto.png')

		expect(image).toMatchObject({ type: 'jpg', width: 1024, height: 768 })
	})

	test('tautan mati, penolakan CORS, dan halaman galat menjadi null', async () => {
		spyOn(globalThis, 'fetch').mockResolvedValue(new Response('tidak ada', { status: 404 }))
		expect(await loadExportImage('https://contoh.id/hilang.png')).toBeNull()

		spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
		expect(await loadExportImage('https://contoh.id/cors.png')).toBeNull()

		spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>login</html>'))
		expect(await loadExportImage('https://contoh.id/login')).toBeNull()
	})

	test('WebP di luar peramban tidak bisa diratakan: null, bukan galat', async () => {
		expect(await loadExportImage(`data:image/webp;base64,${base64(WEBP)}`)).toBeNull()
	})

	test('sumber dikumpulkan sekali per src, termasuk yang ada di dalam tabel', () => {
		const image = (src: string) => ({ type: 'image', attrs: { src } })
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				image('https://contoh.id/a.png'),
				image('https://contoh.id/a.png'),
				{
					type: 'table',
					content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [image(PNG_1PX)] }] }],
				},
			],
		})

		expect(collectImageSources(doc)).toEqual(['https://contoh.id/a.png', PNG_1PX])
	})
})

describe('ukuran gambar di halaman', () => {
	const natural = { width: 800, height: 400 }

	test('tanpa ukuran: ukuran hakiki, dibatasi lebar area teks dengan rasio tetap', () => {
		expect(imageBox({}, natural, 1000)).toEqual({ width: 800, height: 400 })
		expect(imageBox({}, natural, 600)).toEqual({ width: 600, height: 300 })
	})

	test('width saja: tinggi mengikuti rasio', () => {
		expect(imageBox({ width: 300 }, natural, 600)).toEqual({ width: 300, height: 150 })
	})

	test('width ≤ 100 tanpa height adalah persen lebar area teks (bentuk lama)', () => {
		expect(imageBox({ width: 50, height: null }, natural, 600)).toEqual({ width: 300, height: 150 })
	})

	test('width dan height: dipakai persis, walau rasionya berbeda', () => {
		expect(imageBox({ width: 80, height: 200 }, natural, 600)).toEqual({ width: 80, height: 200 })
		expect(imageBox({ width: '300', height: '100' }, natural, 600)).toEqual({ width: 300, height: 100 })
	})

	test('lebih lebar dari tempatnya: diperkecil bersama tingginya', () => {
		expect(imageBox({ width: 1200, height: 300 }, natural, 600)).toEqual({ width: 600, height: 150 })
	})
})

describe('sebutan gambar yang tidak ikut', () => {
	test('alt lebih dulu, lalu judul, lalu nama berkas', () => {
		expect(imageLabel({ alt: 'Grafik penjualan', title: 'x', src: 'https://a.id/g.png' })).toBe(
			'Grafik penjualan',
		)
		expect(imageLabel({ alt: ' ', title: 'Peta lokasi', src: 'https://a.id/g.png' })).toBe('Peta lokasi')
		expect(imageLabel({ src: 'https://a.id/aset/grafik%20batang.png?v=2' })).toBe('grafik batang.png')
	})

	test('gambar tempelan dan URL tanpa nama berkas', () => {
		expect(imageLabel({ src: PNG_1PX })).toBe('gambar tempelan')
		expect(imageLabel({ src: 'https://a.id/' })).toBe('gambar')
	})
})
