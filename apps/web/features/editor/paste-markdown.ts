import { Extension } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { looksLikeMarkdown, markdownToHtml } from './markdown'

/**
 * Menempel Markdown mentah jadi rich text.
 *
 * Berbeda dari input rule yang bekerja karakter demi karakter saat mengetik,
 * ini berlaku sekali untuk seluruh potongan yang ditempel - dan justru di
 * situlah Markdown paling sering datang: disalin dari jawaban AI, README, atau
 * catatan.
 *
 * Hanya menyentuh tempelan yang benar-benar teks polos. Kalau papan klip sudah
 * membawa HTML - menyalin dari halaman web atau dari dokumen lain - HTML itu
 * yang dipakai, karena ia lebih kaya daripada tebakan apa pun atas teksnya.
 */
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

						// Ada HTML di papan klip: serahkan ke penanganan bawaan.
						if (clipboard.getData('text/html')) return false

						const text = clipboard.getData('text/plain')
						if (!text || !looksLikeMarkdown(text)) return false

						const html = markdownToHtml(text)
						if (!html) return false

						// Dilewatkan parser ProseMirror, bukan disisipkan sebagai HTML
						// mentah, supaya aturan `parseHTML` tiap ekstensi tetap berlaku -
						// termasuk yang kita tambahkan sendiri seperti indentasi dan rumus.
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
