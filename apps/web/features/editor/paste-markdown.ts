import { Extension } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { looksLikeMarkdown, markdownToHtml } from './markdown'

export const PasteMarkdown = Extension.create({
	name: 'pasteMarkdown',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('pasteMarkdown'),

				props: {
					handlePaste(view, event) {
						const clipboard = event.clipboardData
						if (!clipboard) return false
						if (clipboard.getData('text/html')) return false

						const text = clipboard.getData('text/plain')
						if (!text || !looksLikeMarkdown(text)) return false

						const html = markdownToHtml(text)
						if (!html) return false
						const body = new DOMParser().parseFromString(html, 'text/html').body
						const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(body)

						view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
						event.preventDefault()
						return true
					},
				},
			}),
		]
	},
})
