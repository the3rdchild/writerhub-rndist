import { mergeAttributes, nodeInputRule, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ResizableImageView } from '@/components/editor/resizable-image-view'

/**
 * Gambar yang bisa diubah ukurannya lewat handle di sudutnya, mempertahankan
 * rasio aspek. Menggantikan Image bawaan supaya tiap gambar (baik sisipan
 * maupun impor DOCX) tampil dengan handle yang konsisten.
 *
 * Lebar disimpan sebagai persentase kontainer (atribut `width`) supaya tahan
 * terhadap perbesaran halaman. Input rule `![alt](url)` diturunkan dari versi
 * sebelumnya (ImageWithMarkdown) supaya mengetik sintaks markdown tetap
 * menghasilkan gambar.
 *
 * Berbeda dari resizable-media ferdocs: tidak ada unggah IPFS / enkripsi - sumber
 * gambar adalah URL atau base64, sama seperti editor ini selalu bekerja.
 */

const IMAGE_INPUT = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/

export interface ResizableImageOptions {
	HTMLAttributes?: Record<string, unknown>
	inline: boolean
	allowBase64: boolean
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		resizableImage: {
			setImage: (options: {
				src: string
				alt?: string | null
				title?: string | null
				width?: number | null
			}) => ReturnType
			/** Perataan gambar blok: kiri/tengah/kanan. */
			setImageAlign: (align: 'left' | 'center' | 'right') => ReturnType
			/** Kembalikan perataan ke bawaan (mengikuti paragraf). */
			unsetImageAlign: () => ReturnType
		}
	}
}

export const ResizableImage = Node.create<ResizableImageOptions>({
	name: 'image',

	inline: false,

	group: 'block',

	draggable: true,

	addOptions() {
		return {
			HTMLAttributes: { class: 'resizable-image' },
			inline: false,
			allowBase64: true,
		}
	},

	addAttributes() {
		return {
			src: { default: null },
			alt: { default: null },
			title: { default: null },
			// Lebar tampilan. Bisa persen kontainer (hasil seret handle) atau
			// piksel (hasil impor DOCX); node view membedakannya dari nilai.
			width: {
				default: null,
				parseHTML: (element) => {
					const raw = element.getAttribute('width')
					const num = raw ? Number.parseFloat(raw) : null
					return Number.isFinite(num as number) ? num : null
				},
				renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
			},
			// Tinggi tampilan, dalam piksel (hasil impor DOCX).
			height: {
				default: null,
				parseHTML: (element) => element.getAttribute('height') ?? null,
				renderHTML: (attributes) => (attributes.height ? { height: attributes.height } : {}),
			},
			// Perataan gambar blok. `null` = ikut paragraf (bawaan). Dipakai untuk
			// menengahkan/menggeser gambar tanpa mengubah perataan teks di sekitarnya.
			align: {
				default: null,
				parseHTML: (element) => {
					const dom = element as HTMLElement
					return dom.getAttribute('data-align') ?? dom.style?.textAlign ?? null
				},
				renderHTML: (attributes) =>
					attributes.align ? { 'data-align': attributes.align } : {},
			},
		}
	},

	parseHTML() {
		return [
			{
				tag: this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])',
				getAttrs: (element) => {
					// Ubah elemen <img> biasa (mis. dari impor DOCX/markdown) menjadi
					// node resizable; lebar awal diambil dari atributnya bila ada.
					const dom = element as HTMLElement
					return { src: dom.getAttribute('src'), alt: dom.getAttribute('alt'), title: dom.getAttribute('title') }
				},
			},
		]
	},

	// Wajib ada meski seluruh tampilan datang dari node view: Tiptap hanya
	// memasang `spec.toDOM` bila `renderHTML` didefinisikan, dan ProseMirror
	// memanggilnya untuk serialisasi (salin, ekspor, `getHTML`) - juga saat
	// node view belum sempat terpasang.
	renderHTML({ HTMLAttributes }) {
		return ['img', mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes)]
	},

	addNodeView() {
		return ReactNodeViewRenderer(ResizableImageView)
	},

	addCommands() {
		return {
			setImage:
				(options) =>
				({ commands }) =>
					commands.insertContent({
						type: this.name,
						attrs: options,
					}),
			setImageAlign:
				(align) =>
				({ commands }) =>
					commands.updateAttributes(this.name, { align }),
			unsetImageAlign:
				() =>
				({ commands }) =>
					commands.resetAttributes(this.name, 'align'),
		}
	},

	addInputRules() {
		return [
			nodeInputRule({
				find: IMAGE_INPUT,
				type: this.type,
				getAttributes: (match) => ({ alt: match[1], src: match[2], title: match[3] }),
			}),
		]
	},
})
