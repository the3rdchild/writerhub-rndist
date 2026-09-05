/**
 * Gambar, kotak teks, dan pratinjau objek tertanam.
 *
 * Satu berkas Word bisa membawa keempat bentuk sekaligus - `w:drawing`
 * (sebaris maupun mengambang), `w:pict` VML, `w:object` OLE, dan
 * `mc:AlternateContent` yang memuat dua versi hal yang sama. Yang tidak bisa
 * dirender dicatat lewat `skip` supaya muncul sebagai peringatan impor,
 * bukan hilang diam-diam.
 */
import type { JSONContent } from '@tiptap/core'
import { type ParseContext, type ReadParagraph, skip } from './context'
import { emuToPx } from './units'
import { attr, child, children, descendAll, tagName } from './xml'
import { resolvePath } from './zip'

/** Media yang bisa dirender `<img>`; EMF/WMF tidak punya dekoder di browser. */
const RASTER_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tif', 'tiff'])

function mediaType(path: string): string {
	const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : ''
	switch (ext) {
		case 'png':
			return 'image/png'
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg'
		case 'gif':
			return 'image/gif'
		case 'bmp':
			return 'image/bmp'
		case 'webp':
			return 'image/webp'
		case 'svg':
			return 'image/svg+xml'
		case 'tif':
		case 'tiff':
			return 'image/tiff'
		default:
			return 'application/octet-stream'
	}
}

function toDataUrl(mediaPath: string, bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
	return `data:${mediaType(mediaPath)};base64,${btoa(binary)}`
}

/** Gambar dari satu `r:embed` — null bila relasi/medianya tidak ada. */
function imageOf(
	embedId: string | undefined,
	context: ParseContext,
	size?: { width?: number; height?: number },
	alt?: string,
): JSONContent | null {
	if (!embedId) return null

	const relationship = context.relationships.get(embedId)
	if (!relationship || relationship.external) return null

	const mediaPath = resolvePath(context.mainPart, relationship.target)
	const bytes = context.archive.bytes(mediaPath)
	if (!bytes) return null

	const ext = mediaPath.includes('.') ? mediaPath.slice(mediaPath.lastIndexOf('.') + 1).toLowerCase() : ''
	if (!RASTER_EXT.has(ext)) return null

	const attrs: Record<string, unknown> = { src: toDataUrl(mediaPath, bytes) }
	if (alt) attrs.alt = alt
	if (size?.width !== undefined) attrs.width = size.width
	if (size?.height !== undefined) attrs.height = size.height

	return { type: 'image', attrs }
}

function emuAttr(node: Element | null | undefined, name: string): number | undefined {
	const raw = attr(node, name)
	if (raw === undefined) return undefined
	const parsed = Number.parseInt(raw, 10)
	return Number.isFinite(parsed) ? emuToPx(parsed) : undefined
}

/** Ukuran pt dari atribut `style="width:87.45pt;height:29.45pt"` milik VML. */
function vmlSize(shape: Element | null): { width?: number; height?: number } {
	const style = attr(shape, 'style') ?? ''
	const width = /(?:^|;)\s*width\s*:\s*([\d.]+)pt/i.exec(style)
	const height = /(?:^|;)\s*height\s*:\s*([\d.]+)pt/i.exec(style)
	return {
		...(width ? { width: Math.round(Number.parseFloat(width[1] as string)) } : {}),
		...(height ? { height: Math.round(Number.parseFloat(height[1] as string)) } : {}),
	}
}

/**
 * Kumpulkan media sebuah elemen `w:drawing` (inline maupun mengambang).
 * Gambar mengambang dan grup gambar bisa memuat beberapa `a:blip` sekaligus;
 * semuanya disisipkan sebaris pada posisi jangkarnya.
 */
function drawingImages(drawing: Element, context: ParseContext): JSONContent[] {
	const frame = child(drawing, 'inline') ?? child(drawing, 'anchor')
	const extent = child(frame, 'extent')
	const size = {
		width: emuAttr(extent, 'cx'),
		height: emuAttr(extent, 'cy'),
	}
	const docPr = child(frame, 'docPr')
	const alt = docPr ? (attr(docPr, 'descr') ?? attr(docPr, 'name') ?? undefined) : undefined

	const images: JSONContent[] = []
	for (const blip of descendAll(drawing, 'blip')) {
		// Blip pertama pakai extent bingkai; sisanya (grup) tanpa ukuran eksplisit.
		const image = imageOf(
			attr(blip, 'embed'),
			context,
			images.length === 0 ? size : undefined,
			images.length === 0 ? alt : undefined,
		)
		if (image) images.push(image)
	}
	return images
}

/**
 * Kumpulkan isi kotak teks (`w:txbxContent`) dari seluruh subtree —
 * paragrafnya diterbitkan sebagai blok biasa di posisi jangkarnya.
 */
function textboxBlocks(root: Element, readParagraph: ReadParagraph): JSONContent[] {
	const blocks: JSONContent[] = []
	for (const content of descendAll(root, 'txbxContent')) {
		for (const paragraph of children(content, 'p')) {
			blocks.push(...readParagraph(paragraph))
		}
	}
	return blocks
}

/**
 * Media satu elemen (drawing/pict/object/AlternateContent) — null bila bukan media.
 */
export function mediaElement(
	candidate: Element,
	context: ParseContext,
	readParagraph: ReadParagraph,
): JSONContent[] | null {
	const name = tagName(candidate)

	if (name === 'drawing') {
		const images = drawingImages(candidate, context)
		if (images.length > 0) return images
		skip(context, 'drawing')
		return []
	}

	if (name === 'pict' || name === 'object') {
		// Pratinjau objek tertanam: v:imagedata pada v:shape; kotak teks VML:
		// v:textbox berisi w:txbxContent.
		let hasPreview = false
		const after: JSONContent[] = []
		for (const shape of descendAll(candidate, 'shape')) {
			const imageData = child(shape, 'imagedata')
			if (!imageData) continue
			hasPreview = true
			const image = imageOf(attr(imageData, 'id'), context, vmlSize(shape))
			if (image) after.push(image)
			else if (attr(imageData, 'id')) skip(context, 'pratinjau-emf')
		}
		const textboxes = textboxBlocks(candidate, readParagraph)
		after.push(...textboxes)
		if (name === 'object' && !hasPreview) skip(context, 'object')
		if (name === 'pict' && !hasPreview && textboxes.length === 0) skip(context, 'pict')
		return after
	}

	if (name === 'AlternateContent') {
		// Preferensi: gambar mengambang dari mc:Choice (DrawingML), teks
		// kotak dari mc:Fallback (VML) — satu sisi per jenis mencegah isi ganda.
		const after: JSONContent[] = []
		const choice = child(candidate, 'Choice')
		if (choice) {
			for (const drawing of descendAll(choice, 'drawing')) {
				after.push(...drawingImages(drawing, context))
			}
		}
		const fallback = child(candidate, 'Fallback')
		const textboxRoot = fallback ?? choice
		if (textboxRoot) after.push(...textboxBlocks(textboxRoot, readParagraph))
		else skip(context, 'AlternateContent')
		return after
	}

	return null
}

/** Media dalam satu run: gambar, kotak teks, pratinjau objek — per anak run. */
export function runMedia(node: Element, context: ParseContext, readParagraph: ReadParagraph): JSONContent[] {
	const after: JSONContent[] = []
	for (const candidate of children(node)) {
		const media = mediaElement(candidate, context, readParagraph)
		if (media) after.push(...media)
	}
	return after
}
