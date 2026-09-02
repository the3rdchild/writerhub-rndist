import { mergeAttributes, Node } from '@tiptap/core'

export const HTML_BLOCK = 'htmlBlock'

/**
 * Dua watak yang berbeda urusan, bukan satu blok dengan sakelar hiasan:
 *
 * - `embed` - sisipan kecil yang ikut mengalir bersama naskah, tingginya diatur
 *   penulis. Untuk hal kecil yang ditempel di tengah dokumen.
 * - `page` - rancangan satu halaman penuh yang mengisi lembar sampai tepi
 *   kertas. Tingginya bukan urusan penulis melainkan urusan geometri halaman,
 *   jadi ia tidak bisa ditarik dan tidak bisa meluap.
 */
export type HtmlBlockFit = 'embed' | 'page'

export interface HtmlBlockAttrs {
	/** Sumber rancangannya. Tidak dipercaya - lihat `html-sandbox.ts`. */
	html: string
	fit: HtmlBlockFit
	/**
	 * Tinggi blok di kanvas, dalam px. Hanya dipakai `fit: 'embed'`; mode
	 * halaman mengambil tingginya dari geometri lembar.
	 */
	height: number
	/**
	 * PNG hasil potretan terakhir sebagai URI `data:`, diperbarui
	 * `refreshHtmlBlocks` tepat sebelum ekspor. Ia tidak ikut ditulis ke HTML
	 * dokumen: ia turunan dari `html`, bukan isi.
	 */
	snapshot: string
	/** Ukuran potretan itu, dipakai penempatan gambar di DOCX. */
	snapshotWidth: number
	snapshotHeight: number
}

export const DEFAULT_HTML_BLOCK_ATTRS: HtmlBlockAttrs = {
	html: '',
	fit: 'embed',
	height: 320,
	snapshot: '',
	snapshotWidth: 0,
	snapshotHeight: 0,
}

const MIN_HEIGHT = 48

/**
 * Batas atas terakhir untuk dokumen tanpa geometri halaman - mode pageless,
 * atau saat tinggi lembar belum sempat terbaca. Halaman sungguhan selalu lebih
 * pendek dari ini, jadi ia hampir tidak pernah yang menentukan.
 */
const MAX_HEIGHT = 4000

/**
 * Menjepit tinggi blok sisipan. `pageLimit` adalah tinggi kotak konten halaman:
 * sisipan tidak boleh lebih tinggi dari itu, karena blok yang melampaui satu
 * halaman tidak bisa lagi diselamatkan paginasi - begitu ia jadi blok pertama
 * di sebuah halaman, mendorongnya cuma memindahkan luapan
 * (`features/editor/pagination.ts`).
 */
export function clampHtmlBlockHeight(height: number, pageLimit?: number): number {
	const ceiling = pageLimit && pageLimit > MIN_HEIGHT ? Math.min(MAX_HEIGHT, pageLimit) : MAX_HEIGHT
	if (!Number.isFinite(height)) return Math.min(DEFAULT_HTML_BLOCK_ATTRS.height, ceiling)
	return Math.max(MIN_HEIGHT, Math.min(ceiling, Math.round(height)))
}

/**
 * Blok rancangan HTML: satu petak berisi HTML utuh yang dirender terkurung, di
 * luar jangkauan skema ProseMirror.
 *
 * Ia ada karena flyer, pamflet, dan poster butuh tata letak yang tidak bisa
 * dinyatakan sebagai paragraf dan judul - gradien, penempatan mutlak, elemen
 * bertumpuk. Untuk badan naskah biasa blok ini justru pilihan yang salah: saat
 * diekspor ia menjadi gambar, jadi teks di dalamnya tidak bisa dicari maupun
 * disunting di Word.
 */
export const HtmlBlock = Node.create({
	name: HTML_BLOCK,
	group: 'block',
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			html: { default: DEFAULT_HTML_BLOCK_ATTRS.html },
			fit: {
				default: DEFAULT_HTML_BLOCK_ATTRS.fit,
				parseHTML: (element) => (element.getAttribute('data-fit') === 'page' ? 'page' : 'embed'),
				renderHTML: (attributes) => ({ 'data-fit': String(attributes.fit) }),
			},
			height: {
				default: DEFAULT_HTML_BLOCK_ATTRS.height,
				parseHTML: (element) => clampHtmlBlockHeight(Number(element.getAttribute('data-height'))),
				renderHTML: (attributes) => ({ 'data-height': String(attributes.height) }),
			},
			snapshot: { default: '', rendered: false },
			snapshotWidth: { default: 0, rendered: false },
			snapshotHeight: { default: 0, rendered: false },
		}
	},

	parseHTML() {
		return [
			{
				tag: `div[data-type="${HTML_BLOCK}"]`,
				getAttrs: (element) => ({
					html: element.getAttribute('data-html') ?? '',
					fit: element.getAttribute('data-fit') === 'page' ? 'page' : 'embed',
					height: clampHtmlBlockHeight(Number(element.getAttribute('data-height'))),
				}),
			},
		]
	},

	renderHTML({ HTMLAttributes, node }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-type': HTML_BLOCK,
				'data-html': node.attrs.html as string,
			}),
		]
	},

	addCommands() {
		return {
			insertHtmlBlock:
				(attrs) =>
				({ chain }) =>
					chain()
						.focus()
						.insertContent({
							type: HTML_BLOCK,
							attrs: {
								...DEFAULT_HTML_BLOCK_ATTRS,
								...attrs,
								height: clampHtmlBlockHeight(attrs.height ?? DEFAULT_HTML_BLOCK_ATTRS.height),
							},
						})
						.run(),
		}
	},
})

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		htmlBlock: {
			insertHtmlBlock: (attrs: Partial<HtmlBlockAttrs> & { html: string }) => ReturnType
		}
	}
}
