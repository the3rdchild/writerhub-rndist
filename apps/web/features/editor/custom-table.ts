import { TableCell, TableHeader } from '@tiptap/extension-table'
export const NO_COLOR = 'transparent'

const colorAttributes = {
	backgroundColor: {
		default: null,
		parseHTML: (element: HTMLElement) =>
			element.getAttribute('data-background-color') ??
			(element.style.backgroundColor ? element.style.backgroundColor : null),
		renderHTML: (attributes: { backgroundColor?: string | null }) => {
			if (!attributes.backgroundColor) return {}
			return {
				'data-background-color': attributes.backgroundColor,
				style: `background-color: ${attributes.backgroundColor}`,
			}
		},
	},
	borderColor: {
		default: null,
		parseHTML: (element: HTMLElement) => element.getAttribute('data-border-color'),
		renderHTML: (attributes: { borderColor?: string | null }) => {
			if (!attributes.borderColor) return {}
			return {
				'data-border-color': attributes.borderColor,
				style: `border-color: ${attributes.borderColor}`,
			}
		},
	},
}

export const CustomTableCell = TableCell.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...colorAttributes,
		}
	},
})

export const CustomTableHeader = TableHeader.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...colorAttributes,
		}
	},
})
