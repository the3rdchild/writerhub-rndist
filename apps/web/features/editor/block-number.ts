'use client'

import { Extension } from '@tiptap/core'
const NUMBERED = ['paragraph', 'heading']

export const BlockNumber = Extension.create({
	name: 'blockNumber',

	addGlobalAttributes() {
		return [
			{
				types: NUMBERED,
				attributes: {
					suppressNumber: {
						default: null,
						parseHTML: (element) => element.hasAttribute('data-no-number'),
						renderHTML: (attributes) =>
							attributes.suppressNumber ? { 'data-no-number': '' } : {},
					},
					numberStyle: {
						default: null,
						parseHTML: (element) => element.getAttribute('data-number-style'),
						renderHTML: (attributes) =>
							attributes.numberStyle
								? { 'data-number-style': attributes.numberStyle, style: attributes.numberStyle }
								: {},
					},
				},
			},
		]
	},
})
