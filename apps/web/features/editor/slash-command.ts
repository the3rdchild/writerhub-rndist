'use client'

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
export const slashCommandKey = new PluginKey('slashCommand')

export interface SlashCommandState {
	open: boolean
	clientRect: (() => DOMRect | null) | null
	range: { from: number; to: number } | null
	query: string
}

export interface SlashCommandOptions {
	onOpen: (state: SlashCommandState) => void
	onUpdate: (state: SlashCommandState) => void
	onClose: () => void
}

function readClientRect(view: { dom: Element }): (() => DOMRect | null) | null {
	const selection = window.getSelection()
	if (!selection || selection.rangeCount === 0) return null
	const range = selection.getRangeAt(0)
	if (!view.dom.contains(range.commonAncestorContainer)) return null
	return () => range.getBoundingClientRect()
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
	name: 'slashCommand',

	addOptions() {
		return {
			onOpen: () => {},
			onUpdate: () => {},
			onClose: () => {},
		}
	},

	addProseMirrorPlugins() {
		const { onOpen, onUpdate, onClose } = this.options

		return [
			new Plugin<SlashCommandState>({
				key: slashCommandKey,
				state: {
					init: () => ({ open: false, clientRect: null, range: null, query: '' }),
					apply(tr, value, _oldState, newState) {
						if (!tr.docChanged && !tr.selectionSet) return value
						const { selection } = newState
						const $from = selection.$from
						const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
						const match = textBefore.match(/(?:^|\s)\/(\S*)$/)
						if (!match) {
							return { open: false, clientRect: null, range: null, query: '' }
						}

						const query = match[1]
						const slashPos = $from.pos - query.length - 1
						return { open: true, clientRect: null, range: { from: slashPos, to: $from.pos }, query }
					},
				},
				props: {
					handleKeyDown(view, event) {
						const state = this.getState(view.state)
						if (state?.open && ['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) {
							event.preventDefault()
							return true
						}
						return false
					},
				},
				view: () => ({
					update: (view) => {
						const pluginState = slashCommandKey.getState(view.state)
						if (!pluginState) return
						const withRect: SlashCommandState = { ...pluginState, clientRect: readClientRect(view) }
						if (withRect.open) onOpen(withRect)
						else onClose()
					},
					destroy: () => onClose(),
				}),
			}),
		]
	},
})

