import { mergeAttributes, Node } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode, Slice } from '@tiptap/pm/model'
import { EditorView } from '@tiptap/pm/view'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Blok catatan/seruan - kotak berwarna untuk info, peringatan, tips, dll.
 *
 * Diadaptasi dari ferdocs (callout.tsx) tanpa bergantung pada `dBlock`. Isinya
 * blok biasa (paragraf, daftar, dsb.), jadi ia kompatibel dengan sisa skema
 * naskah yang memakai grup `block` StarterKit.
 *
 * `isolating` membuat blok ini menahan kursor - menekan Enter di ujungnya
 * membuat paragraf baru di dalamnya, bukan keluar dari blok. Keluar dengan
 * tombol panah bawah di baris terakhir atau Escape (lihat addKeyboardShortcuts).
 */

export type CalloutType = 'info' | 'note' | 'tip' | 'warning' | 'success' | 'error'

export const CALLOUT_TYPES: Array<{ id: CalloutType; label: string; emoji: string }> = [
	{ id: 'info', label: 'Info', emoji: 'ℹ️' },
	{ id: 'note', label: 'Catatan', emoji: '📝' },
	{ id: 'tip', label: 'Tips', emoji: '💡' },
	{ id: 'warning', label: 'Peringatan', emoji: '⚠️' },
	{ id: 'success', label: 'Sukses', emoji: '✅' },
	{ id: 'error', label: 'Kesalahan', emoji: '❌' },
]

export interface CalloutOptions {
	HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		callout: {
			setCallout: (type?: CalloutType) => ReturnType
			toggleCallout: (type?: CalloutType) => ReturnType
			unsetCallout: () => ReturnType
		}
	}
}

export const Callout = Node.create<CalloutOptions>({
	name: 'callout',

	group: 'block',

	content: '(paragraph | bulletList | orderedList | taskList | block)+',

	defining: true,
	draggable: true,
	isolating: true,

	addOptions() {
		return {
			HTMLAttributes: {
				class: 'callout-block',
			},
		}
	},

	addAttributes() {
		return {
			calloutType: {
				default: 'info' as CalloutType,
				parseHTML: (element) => element.getAttribute('data-callout-type') ?? 'info',
				renderHTML: (attributes) => ({ 'data-callout-type': attributes.calloutType }),
			},
			emoji: {
				default: 'ℹ️',
				parseHTML: (element) => element.getAttribute('data-emoji'),
				renderHTML: (attributes) => (attributes.emoji ? { 'data-emoji': attributes.emoji } : {}),
			},
		}
	},

	parseHTML() {
		return [{ tag: 'div[data-type="callout"]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'callout' }),
			0,
		]
	},

	addCommands() {
		return {
			setCallout:
				(type: CalloutType = 'info') =>
				({ commands }) =>
					commands.wrapIn(this.name, { calloutType: type }),
			toggleCallout:
				(type: CalloutType = 'info') =>
				({ commands }) =>
					commands.toggleWrap(this.name, { calloutType: type }),
			unsetCallout:
				() =>
				({ commands }) =>
					commands.lift(this.name),
		}
	},

	addKeyboardShortcuts() {
		return {
			// Keluar dari callout di akhir isinya dengan panah bawah bila sudah di
			// baris terakhir, atau Escape.
			Escape: () => {
				if (!this.editor.isActive('callout')) return false
				return this.editor.commands.unsetCallout()
			},
		}
	},

	addProseMirrorPlugins() {
		const pluginKey = new PluginKey('callout-block')
		return [
			new Plugin({
				key: pluginKey,
				props: {
					// Menempel blok lain ke dalam callout: isinya diratakan supaya
					// tidak ada callout bersarang atau blok yang tidak muat.
					transformPasted(this: Plugin, slice: Slice, view: EditorView): Slice {
						const { selection } = view.state
						const $from = selection.$from

						let isInsideCallout = false
						for (let depth = $from.depth; depth >= 0; depth--) {
							if ($from.node(depth).type.name === 'callout') {
								isInsideCallout = true
								break
							}
						}
						if (!isInsideCallout) return slice

						const flatten = (fragment: Fragment): ProseMirrorNode[] => {
							const result: ProseMirrorNode[] = []
							fragment.forEach((node) => {
								if (node.type.name === 'callout') {
									result.push(...flatten(node.content))
								} else {
									result.push(node)
								}
							})
							return result
						}
						return new Slice(Fragment.from(flatten(slice.content)), slice.openStart, slice.openEnd)
					},
				},
			}),
		]
	},
})
