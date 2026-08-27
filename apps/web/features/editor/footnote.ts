import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface FootnoteOptions {
	HTMLAttributes: Record<string, unknown>
}

export const footnoteRefDecorationKey = new PluginKey('footnoteRefDecoration')

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		footnote: {
			insertFootnote: (id: string) => ReturnType
		}
	}
}

export const Footnote = Node.create<FootnoteOptions>({
	name: 'footnote',

	group: 'block',

	content: 'inline*',

	defining: true,

	addOptions() {
		return { HTMLAttributes: {} }
	},

	parseHTML() {
		return [{ tag: 'footnote' }, { tag: 'section[data-type="footnote"]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'section',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'footnote' }),
			0,
		]
	},

	addCommands() {
		return {
			insertFootnote:
				(id: string) =>
				({ commands }) =>
					commands.insertContent({
						type: 'footnoteRef',
						attrs: { id },
					}),
		}
	},
})

export const FootnoteRef = Node.create({
	name: 'footnoteRef',

	group: 'inline',

	inline: true,

	atom: true,

	addAttributes() {
		return {
			id: { default: null },
		}
	},

	parseHTML() {
		return [{ tag: 'footnote-ref' }, { tag: 'sup[data-type="footnote-ref"]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return ['sup', mergeAttributes({ 'data-type': 'footnote-ref' }, HTMLAttributes), 0]
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: footnoteRefDecorationKey,
				state: {
					init: () => DecorationSet.empty,
					apply(tr, old: DecorationSet) {
						const sel = tr.selection
						const decorations: Decoration[] = []
						if (sel && sel.empty === false) {
						}
						tr.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
							if (node.type.name === 'footnoteRef') {
								decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'footnote-ref--active' }))
							}
						})
						return DecorationSet.create(tr.doc, decorations)
					},
				},
				props: {
					decorations(state) {
						return this.getState(state)
					},
				},
			}),
		]
	},
})
