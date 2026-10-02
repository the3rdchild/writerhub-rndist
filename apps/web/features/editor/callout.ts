import { mergeAttributes, Node } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
export type CalloutType = 'info' | 'note' | 'tip' | 'warning' | 'success' | 'error'

export const CALLOUT_TYPES: Array<{ id: CalloutType; label: string; emoji: string }> = [
	{ id: 'info', label: 'Info', emoji: 'ℹ️' },
	{ id: 'note', label: 'Catatan', emoji: '📝' },
	{ id: 'tip', label: 'Tips', emoji: '💡' },
	{ id: 'warning', label: 'Peringatan', emoji: '⚠️' },
	{ id: 'success', label: 'Sukses', emoji: '✅' },
	{ id: 'error', label: 'Kesalahan', emoji: '❌' },
]

const LEGACY_DEFAULT_EMOJI = 'ℹ️'

export function calloutEmoji(type: string): string {
	return CALLOUT_TYPES.find((item) => item.id === type)?.emoji ?? LEGACY_DEFAULT_EMOJI
}

/**
 * Ikon callout mengikuti jenisnya. Dulu `emoji` berbawaan ℹ️ dan tidak pernah
 * diisi saat menyisip, sehingga callout "Kesalahan" pun berikon info (uji
 * editor 2 Okt, TKS-14). Callout lama yang tersimpan dengan ℹ️ bawaan untuk
 * jenis selain info ikut tampil benar; emoji pilihan sendiri tetap dihormati.
 */
export function resolvedCalloutEmoji(type: string, emoji: string | null | undefined): string {
	if (!emoji || (emoji === LEGACY_DEFAULT_EMOJI && type !== 'info')) return calloutEmoji(type)
	return emoji
}

export interface CalloutOptions {
	HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		callout: {
			setCallout: (type?: CalloutType) => ReturnType
			toggleCallout: (type?: CalloutType) => ReturnType
			unsetCallout: () => ReturnType
			/** Ganti jenis callout tempat kursor berada (beserta ikonnya). */
			setCalloutType: (type: CalloutType) => ReturnType
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
				default: null,
				parseHTML: (element) => element.getAttribute('data-emoji'),
				renderHTML: (attributes) => ({
					'data-emoji': resolvedCalloutEmoji(String(attributes.calloutType ?? 'info'), attributes.emoji),
				}),
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
					commands.wrapIn(this.name, { calloutType: type, emoji: calloutEmoji(type) }),
			toggleCallout:
				(type: CalloutType = 'info') =>
				({ commands }) =>
					commands.toggleWrap(this.name, { calloutType: type, emoji: calloutEmoji(type) }),
			setCalloutType:
				(type: CalloutType) =>
				({ commands }) =>
					commands.updateAttributes(this.name, { calloutType: type, emoji: calloutEmoji(type) }),
			unsetCallout:
				() =>
				({ commands }) =>
					commands.lift(this.name),
		}
	},

	addKeyboardShortcuts() {
		return {
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
