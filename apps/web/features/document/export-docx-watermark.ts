import type { Watermark } from '@writer-hub/shared'
import type { PageGeometry } from '@/features/editor/page-geometry'
import { watermarkBox, watermarkIsEmpty, watermarkSizePx, watermarkSlots } from '@/features/editor/watermark'
import type { ExportImage } from './export-images'

/**
 * Watermark → header Word, di belakang teks (KOL-12).
 *
 * Dulu pengekspor tidak pernah merujuk watermark: kanvas dan PDF menampilkannya,
 * berkas Word tidak. Letak, ukuran, rotasi, dan opasitasnya dihitung dengan
 * matematika yang sama dengan penyaji layar (`features/editor/watermark.ts`):
 * bidang acuannya kotak isi - atau kertas utuh bila `bleed` - dan titiknya
 * fraksi bidang itu.
 *
 * - Teks: bentuk WordArt VML (`v:textpath`), bentuk yang ditulis Word sendiri
 *   untuk watermark teks. Id `PowerPlusWaterMarkObject…` membuat Word mengenalinya
 *   sebagai watermark (Design › Watermark › Remove bekerja).
 * - Gambar: gambar mengambang DrawingML di belakang teks. Opasitasnya
 *   (`a:alphaModFix`) tidak bisa dinyatakan lewat API `ImageRun`, jadi ditempel
 *   ke XML header setelah dikemas (`export-docx-post.ts`), dikenali dari nama
 *   gambarnya.
 */

type DocxModule = typeof import('docx')
type XmlComponent = InstanceType<DocxModule['XmlComponent']>

/** Nama `wp:docPr` gambar watermark - penanda untuk penempelan opasitas. */
export const WATERMARK_IMAGE_NAME = 'WritingHub Watermark'

/** Sama dengan `watermark-layer.tsx`: lebar rata-rata glif huruf tebal sans-serif. */
const AVERAGE_GLYPH_WIDTH = 0.58

/** Tinta teks watermark di kanvas (`.document-watermark-text`), juga di tema gelap. */
const TEXT_COLOR = '#111827'

const PT_PER_PX = 0.75
const EMU_PER_PX = 9525

export interface WatermarkPlacement {
	/** Sudut kiri-atas kotak (sebelum diputar) relatif bidang acuan, px. */
	left: number
	top: number
	width: number
	height: number
	/** Bidang acuan Word: kotak margin, atau kertas utuh untuk `bleed`. */
	relative: 'margin' | 'page'
}

/** Ukuran huruf teks watermark - rumus yang sama dengan kanvas (`fontSizeFor`). */
export function watermarkFontPx(text: string, widthPx: number): number {
	const glyphs = Math.max(2, text.trim().length)
	return Math.max(8, widthPx / (glyphs * AVERAGE_GLYPH_WIDTH))
}

/**
 * Kotak tiap salinan watermark. CSS kanvas: titik jangkar `left/top` (fraksi
 * bidang acuan), lalu `translate(shift%)` seukuran watermark sendiri, lalu
 * `rotate` di sekitar titik tengahnya - VML dan DrawingML juga memutar di
 * sekitar titik tengah, jadi sudut kiri-atas sebelum diputar cukup.
 */
export function watermarkPlacements(
	watermark: Watermark,
	geometry: PageGeometry,
	/** Tinggi/lebar gambar; tidak dipakai untuk teks. */
	aspect = 1,
): WatermarkPlacement[] {
	const box = watermarkBox(watermark, geometry)
	const width = watermarkSizePx(watermark, geometry)
	const height = watermark.kind === 'text' ? watermarkFontPx(watermark.text ?? '', width) : width * aspect
	const relative = watermark.bleed ? 'page' : 'margin'
	return watermarkSlots(watermark).map((slot) => ({
		left: slot.left * box.width + (slot.shiftX / 100) * width,
		top: slot.top * box.height + (slot.shiftY / 100) * height,
		width,
		height,
		relative,
	}))
}

const normalizedRotation = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360
const pt = (px: number) => `${Math.round(px * PT_PER_PX * 100) / 100}pt`

/** Definisi bentuk WordArt teks Word (`_x0000_t136`), sekali per paragraf. */
function textShapeType(element: ElementFactory): XmlComponent {
	const formulas = [
		'sum #0 0 10800',
		'prod #0 2 1',
		'sum 21600 0 @1',
		'sum 0 0 @2',
		'sum 21600 0 @3',
		'if @0 @3 0',
		'if @0 21600 @1',
		'if @0 0 @2',
		'if @0 @4 21600',
		'mid @5 @6',
		'mid @8 @5',
		'mid @7 @8',
		'mid @6 @7',
		'sum @6 0 @5',
	]
	return element(
		'v:shapetype',
		[
			element(
				'v:formulas',
				formulas.map((eqn) => element('v:f', [], { eqn })),
			),
			element('v:path', [], {
				textpathok: 't',
				'o:connecttype': 'custom',
				'o:connectlocs': '@9,0;@10,10800;@11,21600;@12,10800',
				'o:connectangles': '270,180,90,0',
			}),
			element('v:textpath', [], { on: 't', fitshape: 't' }),
			element('v:handles', [element('v:h', [], { position: '#0,bottomRight', xrange: '6629,14971' })]),
			element('o:lock', [], { 'v:ext': 'edit', text: 't', shapetype: 't' }),
		],
		{
			id: '_x0000_t136',
			coordsize: '21600,21600',
			'o:spt': '136',
			adj: '10800',
			path: 'm@7,l@8,m@5,21600l@6,21600e',
		},
	)
}

type ElementFactory = (
	name: string,
	children?: (XmlComponent | string)[],
	attrs?: Record<string, string>,
) => XmlComponent

function factory(docx: DocxModule): ElementFactory {
	return (name, children = [], attrs) =>
		new docx.BuilderElement({
			name,
			attributes: attrs
				? Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, { key, value }]))
				: undefined,
			children: children as XmlComponent[],
		})
}

/**
 * Pembangun paragraf watermark untuk header. Setiap panggilan menghasilkan
 * paragraf baru dengan id bentuk yang unik di seluruh dokumen.
 */
export function watermarkParagraphFactory(
	docx: DocxModule,
	watermark: Watermark | undefined,
	image: ExportImage | null,
): ((geometry: PageGeometry) => InstanceType<DocxModule['Paragraph']>) | null {
	if (!watermark || watermarkIsEmpty(watermark)) return null
	if (watermark.kind === 'image' && !image) return null

	const element = factory(docx)
	const rotation = normalizedRotation(watermark.rotation)
	let shapeId = 0

	const textRuns = (geometry: PageGeometry): XmlComponent[] => {
		const text = (watermark.text ?? '').trim()
		const shapes = watermarkPlacements(watermark, geometry).map((place) => {
			shapeId += 1
			const style = [
				'position:absolute',
				`margin-left:${pt(place.left)}`,
				`margin-top:${pt(place.top)}`,
				`width:${pt(place.width)}`,
				`height:${pt(place.height)}`,
				`rotation:${rotation}`,
				`z-index:${-251654144 + shapeId}`,
				'mso-wrap-edited:f',
				`mso-position-horizontal-relative:${place.relative}`,
				`mso-position-vertical-relative:${place.relative}`,
			].join(';')
			return element(
				'v:shape',
				[
					element('v:fill', [], { opacity: String(Math.round(watermark.opacity * 1000) / 1000) }),
					element('v:textpath', [], {
						style: 'font-family:"Arial";font-weight:bold;font-size:1pt',
						string: text,
					}),
					element('w10:wrap', [], { anchorx: place.relative, anchory: place.relative }),
				],
				{
					id: `PowerPlusWaterMarkObject${shapeId}`,
					'o:spid': `_x0000_s${2048 + shapeId}`,
					type: '#_x0000_t136',
					style,
					'o:allowincell': 'f',
					fillcolor: TEXT_COLOR,
					stroked: 'f',
				},
			)
		})
		return [
			element('w:r', [
				element('w:rPr', [element('w:noProof')]),
				element('w:pict', [textShapeType(element), ...shapes]),
			]),
		]
	}

	const imageRuns = (geometry: PageGeometry): XmlComponent[] => {
		if (!image) return []
		const aspect = image.height / image.width
		const relative = watermark.bleed
			? docx.HorizontalPositionRelativeFrom.PAGE
			: docx.HorizontalPositionRelativeFrom.MARGIN
		const vertical = watermark.bleed
			? docx.VerticalPositionRelativeFrom.PAGE
			: docx.VerticalPositionRelativeFrom.MARGIN
		return watermarkPlacements(watermark, geometry, aspect).map(
			(place) =>
				new docx.ImageRun({
					data: image.data,
					type: image.type,
					transformation: {
						width: Math.max(1, Math.round(place.width)),
						height: Math.max(1, Math.round(place.height)),
						...(rotation ? { rotation } : {}),
					},
					floating: {
						horizontalPosition: { relative, offset: Math.round(place.left * EMU_PER_PX) },
						verticalPosition: { relative: vertical, offset: Math.round(place.top * EMU_PER_PX) },
						behindDocument: true,
						allowOverlap: true,
						wrap: { type: docx.TextWrappingType.NONE },
					},
					altText: { name: WATERMARK_IMAGE_NAME, description: '', title: '' },
				}) as unknown as XmlComponent,
		)
	}

	return (geometry) =>
		new docx.Paragraph({
			// Paragraf pembawa watermark nyaris tanpa tinggi: header tidak ikut
			// memanjang dan mendorong naskah ke bawah.
			spacing: { before: 0, after: 0, line: 20, lineRule: docx.LineRuleType.EXACT },
			children: (watermark.kind === 'text' ? textRuns(geometry) : imageRuns(geometry)) as never,
		})
}

/** Opasitas watermark gambar dalam satuan `a:alphaModFix` (1/1000 persen). */
export function watermarkAlpha(watermark: Watermark | undefined): number | null {
	if (watermark?.kind !== 'image') return null
	return Math.round(Math.max(0, Math.min(1, watermark.opacity)) * 100000)
}
