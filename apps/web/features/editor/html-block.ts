import { mergeAttributes, Node } from '@tiptap/core'

export const HTML_BLOCK = 'htmlBlock'

export interface HtmlBlockAttrs {
	/** Sumber rancangannya. Tidak dipercaya - lihat `html-sandbox.ts`. */
	html: string
	/** Tinggi blok di kanvas, dalam px. Lebarnya selalu selebar badan naskah. */
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
	height: 320,
	snapshot: '',
	snapshotWidth: 0,
	snapshotHeight: 0,
}

const MIN_HEIGHT = 48
const MAX_HEIGHT = 4000

export function clampHtmlBlockHeight(height: number): number {
	if (!Number.isFinite(height)) return DEFAULT_HTML_BLOCK_ATTRS.height
	return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)))
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
