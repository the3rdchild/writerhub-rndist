import Heading from '@tiptap/extension-heading'
import { mergeAttributes } from '@tiptap/core'
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
export const VISIBLE_HEADING_LEVELS = [1, 2, 3, 4, 5] as const
function isNativeLevel(level: number): boolean {
	return level >= 1 && level <= 6
}

export const HeadingLevels = Heading.extend({
	addOptions() {
		return {
			levels: HEADING_LEVELS as unknown as 1[],
			HTMLAttributes: {},
		}
	},

	parseHTML() {
		const native = [1, 2, 3, 4, 5, 6].map((level) => ({
			tag: `h${level}`,
			attrs: { level },
		}))
		const extended = [7, 8, 9].map((level) => ({
			tag: `div.heading[data-level="${level}"]`,
			attrs: { level },
		}))
		return [...native, ...extended]
	},

	renderHTML({ node, HTMLAttributes }) {
		const level = (node.attrs.level as number) ?? 1
		if (isNativeLevel(level)) {
			return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
		}
		return [
			'div',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				class: 'heading',
				role: 'heading',
				'aria-level': String(level),
				'data-level': String(level),
			}),
			0,
		]
	},
	renderMarkdown: (node, h) => {
		const level = node.attrs?.level ? parseInt(node.attrs.level, 10) : 1
		const clamped = Math.min(6, Math.max(1, level))
		const headingChars = '#'.repeat(clamped)
		if (!node.content) return ''
		return `${headingChars} ${h.renderChildren(node.content)}`
	},
})

export default HeadingLevels
