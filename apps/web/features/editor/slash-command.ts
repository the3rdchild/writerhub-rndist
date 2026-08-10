'use client'

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Slash command - menu sisip blok yang muncul saat mengetik "/" di awal baris.
 *
 * Ditulis sendiri, bukan memakai @tiptap/suggestion + tippy, supaya tidak ada
 * dua dependensi baru dan supaya cara munculnya konsisten dengan menu seleksi
 * yang sudah ada (portal mengambang di dekat kursor).
 *
 * Ekstensi ini hanya mendeteksi "/" dan melapor ke pemanggil lewat callback
 * `onOpen`/`onUpdate`/`onClose`; komponen menu (daftar item) hidup di React.
 */

export const slashCommandKey = new PluginKey('slashCommand')

export interface SlashCommandState {
	open: boolean
	/** Posisi layar kursor; dipakai menempatkan menu. */
	clientRect: (() => DOMRect | null) | null
	/** Posisi kursor di dokumen (untuk menghapus "/" saat item dipilih). */
	range: { from: number; to: number } | null
	/** Teks filter setelah "/". */
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

						// "/" di awal baris (atau setelah spasi) memicu menu; sisanya jadi filter.
						const match = textBefore.match(/(?:^|\s)\/(\S*)$/)
						if (!match) {
							return { open: false, clientRect: null, range: null, query: '' }
						}

						const query = match[1]
						const slashPos = $from.pos - query.length - 1
						// clientRect tidak bisa diukur di sini (tidak ada view); diisi oleh view.update.
						return { open: true, clientRect: null, range: { from: slashPos, to: $from.pos }, query }
					},
				},
				props: {
					handleKeyDown(view, event) {
						const state = this.getState(view.state)
						// Panah & Escape dipakai menavigasi menu; kursor editor diam.
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
						// clientRect perlu diukur ulang tiap update (kursor/konten bergeser).
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

