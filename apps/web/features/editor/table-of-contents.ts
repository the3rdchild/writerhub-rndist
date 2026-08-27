import { TableOfContents } from '@tiptap/extension-table-of-contents'

export const TableOfContentsConfigured = TableOfContents.configure({
	getId: (textContent) => {
		return textContent
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-')
	},
})
