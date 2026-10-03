import { markInputRule } from '@tiptap/core'
import { Bold as BaseBold, starInputRegex as boldStarInputRegex } from '@tiptap/extension-bold'
import { Code as BaseCode } from '@tiptap/extension-code'
import { Italic as BaseItalic, starInputRegex as italicStarInputRegex } from '@tiptap/extension-italic'
import { Strike as BaseStrike } from '@tiptap/extension-strike'

/*
 * Mark dasar StarterKit tanpa aturan TEMPEL, dan tanpa aturan KETIK bergaris
 * bawah.
 *
 * Aturan tempel bawaan Tiptap menerapkan sintaks Markdown pada teks polos apa
 * pun: "Nilai 2 * 3 * 4" kehilangan kedua bintangnya dan " 3 " menjadi miring;
 * "__init__" yang diketik menjadi "init" tebal (uji editor 2 Okt, TKS-12).
 * Markdown sungguhan tetap diurai utuh oleh `paste-markdown.ts` (yang juga
 * tahu tabel, daftar bersarang, dan rumus), jadi aturan per mark tidak
 * dibutuhkan. Aturan ketik `**tebal**` dan `*miring*` tetap ada.
 */

export const Bold = BaseBold.extend({
	addInputRules() {
		return [markInputRule({ find: boldStarInputRegex, type: this.type })]
	},
	addPasteRules() {
		return []
	},
})

export const Italic = BaseItalic.extend({
	addInputRules() {
		return [markInputRule({ find: italicStarInputRegex, type: this.type })]
	},
	addPasteRules() {
		return []
	},
})

export const Strike = BaseStrike.extend({
	addPasteRules() {
		return []
	},
})

export const Code = BaseCode.extend({
	addPasteRules() {
		return []
	},
})
