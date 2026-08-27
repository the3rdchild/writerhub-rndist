import { mergeAttributes, nodeInputRule, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ResizableImageView } from '@/components/editor/resizable-image-view'
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
			setImageAlign: (align: 'left' | 'center' | 'right') => ReturnType
			unsetImageAlign: () => ReturnType
			setImageOffsetX: (offsetX: number | null) => ReturnType
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
			width: {
				default: null,
				parseHTML: (element) => {
					const raw = element.getAttribute('width')
					const num = raw ? Number.parseFloat(raw) : null
					return Number.isFinite(num as number) ? num : null
				},
				renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
			},
			height: {
				default: null,
				parseHTML: (element) => element.getAttribute('height') ?? null,
				renderHTML: (attributes) => (attributes.height ? { height: attributes.height } : {}),
			},
			offsetX: {
				default: null,
				parseHTML: (element) => {
					const raw = (element as HTMLElement).getAttribute('data-offset-x')
					const parsed = raw === null ? Number.NaN : Number.parseFloat(raw)
					return Number.isFinite(parsed) ? parsed : null
				},
				renderHTML: (attributes) =>
					attributes.offsetX === null ? {} : { 'data-offset-x': attributes.offsetX },
			},
			align: {
				default: null,
				parseHTML: (element) => {
					const dom = element as HTMLElement
					return dom.getAttribute('data-align') ?? dom.style?.textAlign ?? null
				},
				renderHTML: (attributes) => (attributes.align ? { 'data-align': attributes.align } : {}),
			},
		}
	},

	parseHTML() {
		return [
			{
				tag: this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])',
				getAttrs: (element) => {
					const dom = element as HTMLElement
					return {
						src: dom.getAttribute('src'),
						alt: dom.getAttribute('alt'),
						title: dom.getAttribute('title'),
					}
				},
			},
		]
	},
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
					commands.updateAttributes(this.name, { align, offsetX: null }),
			unsetImageAlign:
				() =>
				({ commands }) =>
					commands.updateAttributes(this.name, { align: null, offsetX: null }),
			setImageOffsetX:
				(offsetX) =>
				({ commands }) =>
					commands.updateAttributes(this.name, { offsetX, align: offsetX === null ? null : 'left' }),
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
