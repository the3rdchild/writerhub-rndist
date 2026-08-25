import { Extension, nodeInputRule } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'
const IMAGE_INPUT = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/

export const ImageWithMarkdown = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null,
				parseHTML: (element) => element.getAttribute('width') ?? null,
				renderHTML: (attributes) =>
					attributes.width ? { width: attributes.width } : {},
			},
			height: {
				default: null,
				parseHTML: (element) => element.getAttribute('height') ?? null,
				renderHTML: (attributes) =>
					attributes.height ? { height: attributes.height } : {},
			},
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
export const TrailingParagraph = Extension.create({
	name: 'trailingParagraph',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('trailingParagraph'),

				appendTransaction(_transactions, _oldState, newState) {
					const { doc, tr, schema } = newState
					const last = doc.lastChild
					if (!last) return null
					if (last.type.name === 'paragraph') return null

					return tr.insert(doc.content.size, schema.nodes.paragraph.create())
				},
			}),
		]
	},
})
