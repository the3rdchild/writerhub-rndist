import type { Node as PMNode } from '@tiptap/pm/model'
import { rasterizeSvg } from '@/features/editor/html-raster'

/**
 * Gambar naskah (node `image`) untuk ekspor DOCX.
 *
 * Dulu `exportDocx` tidak punya jalur untuk node ini sama sekali: semua gambar
 * hilang dari berkas Word - dari URL, unggahan, `insert_image` AI, bahkan gambar
 * dari DOCX yang diimpor. Isi berkasnya harus sudah ada di tangan sebelum
 * dokumen ditelusuri, karena `blockOf` sinkron sementara mengambilnya tidak -
 * pola yang sama dengan diagram Mermaid di `export-docx.ts`.
 */

/** Jenis yang dibawa `docx` apa adanya; selebihnya diratakan ke PNG dulu. */
export type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp'

export interface ExportImage {
	data: Uint8Array
	type: DocxImageType
	/** Ukuran hakiki, px. */
	width: number
	height: number
}

export type ImageKind = DocxImageType | 'webp' | 'svg' | 'other'

/** Batas tunggu satu gambar jauh; yang lewat ditandai, bukan menahan ekspor. */
const FETCH_TIMEOUT_MS = 15_000

/**
 * Jenis gambar dari bita pembukanya. Ekstensi URL dan `content-type` tidak
 * dipercaya: CDN gambar lazim menyajikan WebP di balik alamat berakhiran `.jpg`.
 */
export function sniffImage(bytes: Uint8Array): ImageKind {
	const at = (index: number) => bytes[index] ?? -1
	if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png'
	if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg'
	if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'gif'
	if (at(0) === 0x42 && at(1) === 0x4d) return 'bmp'
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp'
	if (/<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 1024)))) return 'svg'
	return 'other'
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
	return String.fromCharCode(...bytes.subarray(from, to))
}

/** Ukuran hakiki dari kepala berkas, tanpa memuat gambarnya. */
export function intrinsicSize(
	bytes: Uint8Array,
	type: DocxImageType,
): { width: number; height: number } | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const size = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null)
	try {
		switch (type) {
			case 'png':
				return size(view.getUint32(16), view.getUint32(20))
			case 'gif':
				return size(view.getUint16(6, true), view.getUint16(8, true))
			// Tinggi negatif berarti baris disimpan dari atas; ukurannya sama.
			case 'bmp':
				return size(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)))
			case 'jpg':
				return jpegSize(view)
		}
	} catch {
		return null
	}
}

/*
 * JPEG menyimpan ukurannya di segmen SOF, yang letaknya tidak tetap: segmen
 * lain (EXIF, tabel kuantisasi) dilompati menurut panjangnya sampai bertemu.
 * C4 (DHT), C8, dan CC (DAC) berada di rentang yang sama tetapi bukan SOF.
 */
function jpegSize(view: DataView): { width: number; height: number } | null {
	let offset = 2
	while (offset + 9 < view.byteLength) {
		if (view.getUint8(offset) !== 0xff) return null
		const marker = view.getUint8(offset + 1)
		if (marker === 0xff) {
			offset += 1
			continue
		}
		const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
		if (isFrame) {
			const height = view.getUint16(offset + 5)
			const width = view.getUint16(offset + 7)
			return width > 0 && height > 0 ? { width, height } : null
		}
		offset += 2 + view.getUint16(offset + 2)
	}
	return null
}

/** Semua `src` gambar di dokumen, tanpa kembar. */
export function collectImageSources(root: PMNode): string[] {
	const found = new Set<string>()
	root.descendants((node) => {
		if (node.type.name !== 'image') return
		const src = String(node.attrs.src ?? '')
		if (src) found.add(src)
	})
	return [...found]
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
	return bytes
}

async function bytesOf(src: string): Promise<Uint8Array | null> {
	try {
		if (src.startsWith('data:')) {
			const comma = src.indexOf(',')
			if (comma < 0) return null
			const header = src.slice(5, comma)
			const payload = src.slice(comma + 1)
			return header.endsWith(';base64')
				? decodeBase64(payload)
				: new TextEncoder().encode(decodeURIComponent(payload))
		}
		/*
		 * Gambar dari host yang tidak mengizinkan CORS tidak bisa dibaca
		 * peramban sama sekali - lewat `fetch` maupun kanvas - jadi ia gagal di
		 * sini dan ditandai di berkasnya.
		 */
		const response = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
		return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
	} catch {
		return null
	}
}

/**
 * Isi berkas satu gambar, siap untuk `ImageRun`, atau `null` bila tidak bisa
 * diambil atau dibaca.
 */
export async function loadExportImage(src: string): Promise<ExportImage | null> {
	const bytes = await bytesOf(src)
	if (!bytes || bytes.length === 0) return null

	const kind = sniffImage(bytes)
	if (kind === 'png' || kind === 'jpg' || kind === 'gif' || kind === 'bmp') {
		const size = intrinsicSize(bytes, kind)
		if (size) return { data: bytes, type: kind, ...size }
	}
	return flattenToPng(bytes, kind)
}

/**
 * WebP, AVIF, SVG, dan berkas yang kepalanya tidak terbaca digambar ulang ke
 * kanvas sebagai PNG - Word tidak mengenal formatnya. Hanya di peramban; di
 * luar itu gambarnya dianggap gagal.
 */
async function flattenToPng(bytes: Uint8Array, kind: ImageKind): Promise<ExportImage | null> {
	if (typeof document === 'undefined') return null

	if (kind === 'svg') {
		const raster = await rasterizeSvg(new TextDecoder().decode(bytes))
		if (!raster?.png.startsWith('data:image/png;base64,')) return null
		return {
			data: decodeBase64(raster.png.slice(22)),
			type: 'png',
			width: raster.width,
			height: raster.height,
		}
	}

	const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
	try {
		const image = new Image()
		image.src = url
		await image.decode()
		const { naturalWidth: width, naturalHeight: height } = image
		if (width <= 0 || height <= 0) return null

		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext('2d')
		if (!context) return null
		context.drawImage(image, 0, 0)
		const png = canvas.toDataURL('image/png')
		return png.startsWith('data:image/png;base64,')
			? { data: decodeBase64(png.slice(22)), type: 'png', width, height }
			: null
	} catch {
		return null
	} finally {
		URL.revokeObjectURL(url)
	}
}

/**
 * Ukuran gambar di halaman, px - aturan yang sama dengan `ResizableImageView`:
 *
 * - `width` ≤ 100 tanpa `height` adalah persen lebar area teks (bentuk lama);
 * - `width` saja: tingginya mengikuti rasio hakiki;
 * - `width` dan `height`: persis itu (sudut sisi boleh mengubah rasio);
 * - tanpa keduanya: ukuran hakiki.
 *
 * Lalu dibatasi lebar yang tersedia. Layar membatasi lewat `max-width`; di sini
 * tingginya ikut diperkecil supaya rasionya tidak rusak.
 *
 * `availableHeight` membatasi tingginya juga, proporsional (OBJ-14): gambar
 * yang lebih tinggi dari area isi halaman dipotong Word di tepi bawah lembar.
 */
export function imageBox(
	attrs: { width?: unknown; height?: unknown },
	natural: { width: number; height: number },
	available: number,
	availableHeight = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
	const setWidth = Number(attrs.width) > 0 ? Number(attrs.width) : null
	const setHeight = Number(attrs.height) > 0 ? Number(attrs.height) : null
	const ratio = natural.height / natural.width

	let width: number
	let height: number
	if (setWidth !== null && setHeight === null && setWidth <= 100) {
		width = (available * setWidth) / 100
		height = width * ratio
	} else if (setWidth !== null) {
		width = setWidth
		height = setHeight ?? setWidth * ratio
	} else {
		width = natural.width
		height = setHeight ?? natural.height
	}

	const room = Math.max(1, available)
	if (width > room) {
		height *= room / width
		width = room
	}
	const roomHeight = Math.max(1, availableHeight)
	if (height > roomHeight) {
		width *= roomHeight / height
		height = roomHeight
	}
	return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

/** Sebutan gambar di penanda "tidak ikut": alt, judul, atau nama berkasnya. */
export function imageLabel(attrs: { src?: unknown; alt?: unknown; title?: unknown }): string {
	const alt = String(attrs.alt ?? '').trim()
	if (alt) return alt
	const title = String(attrs.title ?? '').trim()
	if (title) return title

	const src = String(attrs.src ?? '')
	if (src.startsWith('data:')) return 'gambar tempelan'
	try {
		const name = decodeURIComponent(new URL(src, 'https://x.invalid').pathname.split('/').pop() ?? '')
		if (name) return name.length > 60 ? `${name.slice(0, 57)}...` : name
	} catch {
		/* URL rusak: jatuh ke sebutan umum di bawah. */
	}
	return 'gambar'
}
