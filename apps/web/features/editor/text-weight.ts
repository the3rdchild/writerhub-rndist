'use client'

import { Extension } from '@tiptap/core'
export const TextWeight = Extension.create({
	name: 'textWeight',

	addGlobalAttributes() {
		return [
			{
				types: ['textStyle'],
				attributes: {
					fontWeight: {
						default: null,
						parseHTML: (element) => element.style.fontWeight || null,
						renderHTML: (attributes) =>
							attributes.fontWeight ? { style: `font-weight: ${attributes.fontWeight}` } : {},
					},
				},
			},
		]
	},
})
