import { Extension, nodeInputRule } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Dua penghalus kecil yang dampaknya tidak sebanding dengan ukurannya.
 */

/**
 * `![alt](url)` jadi gambar sungguhan saat diketik.
 *
 * Ekstensi Image bawaan tidak membawa input rule apa pun - ia hanya menyediakan
 * node-nya. Padahal ini satu-satunya sintaks Markdown yang tersisa tanpa
 * padanan ketikan setelah heading, daftar, dan tautan sudah punya.
 */
const IMAGE_INPUT = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/

export const ImageWithMarkdown = Image.extend({
	addAttributes() {
		return {
			// Lebar dan tinggi tampilan, dalam piksel. Dipakai hasil impor DOCX
			// supaya gambar tampil sesuai ukuran di Word, bukan mengikuti resolusi
			// piksel aslinya yang kerap beberapa kali lebih besar. Dituangkan ke
			// `width`/`height` jadi atribut HTML biasa - ringan dan mengikat rasio.
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

/**
 * Selalu sisakan satu paragraf di ujung dokumen.
 *
 * Tanpa ini, dokumen yang berakhir dengan tabel, gambar, atau rumus blok tidak
 * menyisakan tempat untuk kursor - dan menulis setelahnya jadi mustahil tanpa
 * trik. Pada kanvas berhalaman masalahnya lebih terasa: pengguna mengklik ruang
 * kosong di bawah lembar dan tidak terjadi apa-apa.
 */
export const TrailingParagraph = Extension.create({
	name: 'trailingParagraph',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('trailingParagraph'),

				appendTransaction(_transactions, _oldState, newState) {
					const { doc, tr, schema } = newState
					const last = doc.lastChild

					// Paragraf kosong di ujung sudah cukup; menambah lagi tiap transaksi
					// akan menumpuk baris kosong tanpa henti.
					if (!last) return null
					if (last.type.name === 'paragraph') return null

					return tr.insert(doc.content.size, schema.nodes.paragraph.create())
				},
			}),
		]
	},
})
