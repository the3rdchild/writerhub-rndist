import { InputRule } from '@tiptap/core'
import Typography from '@tiptap/extension-typography'
import type { EditorState } from '@tiptap/pm/state'

/**
 * Apakah posisi ini berada di dalam rumus LaTeX yang sedang diketik: `$…`,
 * `$$…`, atau `\(…` yang belum ditutup di paragraf yang sama. Tanda `\$` tidak
 * membuka rumus.
 */
export function insideOpenLatex(textBefore: string): boolean {
	const unescaped = textBefore.replace(/\\\\/g, '').replace(/\\\$/g, '')
	/* `$$` adalah satu pembatas (rumus blok), terpisah dari `$` sebaris. */
	const display = (unescaped.match(/\$\$/g) ?? []).length
	const inline = (unescaped.replace(/\$\$/g, '').match(/\$/g) ?? []).length
	if (display % 2 === 1 || inline % 2 === 1) return true
	const opens = (unescaped.match(/\\\(/g) ?? []).length
	const closes = (unescaped.match(/\\\)/g) ?? []).length
	return opens > closes
}

function insideLatexAt(state: EditorState, pos: number): boolean {
	const $pos = state.doc.resolve(pos)
	return insideOpenLatex($pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼'))
}

/**
 * Koreksi tipografi otomatis (“kutip”, —, →, ², ½) tidak berlaku di dalam
 * rumus LaTeX yang sedang diketik. Dulu `$E=mc^2$` berubah menjadi `$E=mc²$`
 * sebelum sempat dijadikan rumus, sehingga sumbernya rusak (uji editor 2 Okt,
 * OBJ-15). Di luar rumus semuanya tetap seperti bawaan.
 */
export const AutoTypography = Typography.extend({
	addInputRules() {
		return (this.parent?.() ?? []).map(
			(rule) =>
				new InputRule({
					find: rule.find,
					undoable: rule.undoable,
					handler: (props) => (insideLatexAt(props.state, props.range.from) ? null : rule.handler(props)),
				}),
		)
	},
})
