import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Penanda komentar pada teks.
 *
 * Dibuat sebagai mark, bukan sebagai rentang offset yang disimpan terpisah,
 * karena mark ikut bergerak sendiri saat naskah disunting — menyisipkan
 * paragraf di atasnya tidak membuat komentar menunjuk kalimat yang salah.
 * Itu jangkar yang tidak perlu dipelihara.
 */

export const COMMENT_MARK = 'comment'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		comment: {
			setComment: (id: string) => ReturnType
			unsetComment: (id: string) => ReturnType
		}
	}
}

export const CommentMark = Mark.create({
	name: COMMENT_MARK,

	// Beberapa komentar boleh menumpuk pada kalimat yang sama.
	excludes: '',
	inclusive: false,

	addAttributes() {
		return {
			commentId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-comment-id'),
				renderHTML: (attributes) =>
					attributes.commentId ? { 'data-comment-id': attributes.commentId } : {},
			},
		}
	},

	parseHTML() {
		return [{ tag: 'span[data-comment-id]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0]
	},

	addCommands() {
		return {
			setComment:
				(id) =>
				({ commands }) =>
					commands.setMark(this.name, { commentId: id }),

			unsetComment:
				(id) =>
				({ state, tr, dispatch }) => {
					const type = state.schema.marks[this.name]
					let touched = false

					state.doc.descendants((node, pos) => {
						if (!node.isText) return
						const mark = node.marks.find(
							(candidate) => candidate.type === type && candidate.attrs.commentId === id,
						)
						if (!mark) return

						tr.removeMark(pos, pos + node.nodeSize, mark)
						touched = true
					})

					if (touched && dispatch) dispatch(tr)
					return touched
				},
		}
	},
})
