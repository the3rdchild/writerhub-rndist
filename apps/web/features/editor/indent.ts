'use client'

import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { shortcutKeys } from '@/features/shortcuts/registry'
export interface BlockIndent {
	left: number
	right: number
	firstLine: number
}

export const NO_INDENT: BlockIndent = { left: 0, right: 0, firstLine: 0 }
export const INDENT_STEP = 48
const INDENTABLE = ['paragraph', 'heading', 'blockquote', 'table']
const MIN_INDENTED_WIDTH = 48

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		blockIndent: {
			setBlockIndent: (patch: Partial<BlockIndent>) => ReturnType
			shiftBlockIndent: (delta: number) => ReturnType
		}
	}
}

function readPx(value: string | undefined): number {
	if (!value) return 0
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? Math.round(parsed) : 0
}
export function clampBlockIndent(indent: BlockIndent, contentWidth: number): BlockIndent {
	const room = Math.max(0, contentWidth - MIN_INDENTED_WIDTH)

	const left = Math.max(0, Math.min(indent.left, room))
	const right = Math.max(0, Math.min(indent.right, room - left))
	const firstLine = Math.max(-left, Math.min(indent.firstLine, room - left - right))

	return { left, right, firstLine }
}

export const BlockIndentExtension = Extension.create({
	name: 'blockIndent',

	addGlobalAttributes() {
		return [
			{
				types: INDENTABLE,
				attributes: {
					indentLeft: {
						default: 0,
						parseHTML: (element) => readPx(element.style.marginLeft),
						renderHTML: (attributes) =>
							attributes.indentLeft ? { style: `margin-left: ${attributes.indentLeft}px` } : {},
					},
					indentRight: {
						default: 0,
						parseHTML: (element) => readPx(element.style.marginRight),
						renderHTML: (attributes) =>
							attributes.indentRight ? { style: `margin-right: ${attributes.indentRight}px` } : {},
					},
					indentFirstLine: {
						default: 0,
						parseHTML: (element) => readPx(element.style.textIndent),
						renderHTML: (attributes) =>
							attributes.indentFirstLine
								? { style: `text-indent: ${attributes.indentFirstLine}px` }
								: {},
					},
				},
			},
		]
	},

	addCommands() {
		const patchToAttributes = (patch: Partial<BlockIndent>) => ({
			...(patch.left !== undefined ? { indentLeft: Math.round(patch.left) } : {}),
			...(patch.right !== undefined ? { indentRight: Math.round(patch.right) } : {}),
			...(patch.firstLine !== undefined ? { indentFirstLine: Math.round(patch.firstLine) } : {}),
		})

		return {
			setBlockIndent:
				(patch) =>
				({ state, tr, dispatch }) => {
					const attributes = patchToAttributes(patch)
					if (Object.keys(attributes).length === 0) return false

					const { from, to } = state.selection
					let touched = false
					state.doc.nodesBetween(from, to, (node, pos) => {
						if (!INDENTABLE.includes(node.type.name)) return
						for (const [key, value] of Object.entries(attributes)) {
							if (node.attrs[key] === value) continue
							tr.setNodeAttribute(pos, key, value)
							touched = true
						}
					})

					if (touched && dispatch) dispatch(tr)
					return touched
				},

			shiftBlockIndent:
				(delta) =>
				({ editor, commands }) => {
					const current = blockIndentAt(editor)
					return commands.setBlockIndent({ left: Math.max(0, current.left + delta) })
				},
		}
	},

	addKeyboardShortcuts() {
		const shift = (delta: number) => () => {
			if (isInsideAny(this.editor, TAB_OWNERS)) return false
			return this.editor.commands.shiftBlockIndent(delta)
		}

		return {
			[shortcutKeys('para.indent')]: shift(INDENT_STEP),
			[shortcutKeys('para.outdent')]: shift(-INDENT_STEP),
		}
	},
})
const TAB_OWNERS = ['listItem', 'taskItem', 'tableCell', 'tableHeader']

function isInsideAny(editor: Editor, types: readonly string[]): boolean {
	const { $from } = editor.state.selection
	for (let depth = $from.depth; depth > 0; depth -= 1) {
		if (types.includes($from.node(depth).type.name)) return true
	}
	return false
}
export function blockIndentAt(editor: Editor): BlockIndent {
	const { $from } = editor.state.selection

	for (let depth = $from.depth; depth >= 0; depth -= 1) {
		const node = $from.node(depth)
		if (!INDENTABLE.includes(node.type.name)) continue
		return {
			left: node.attrs.indentLeft ?? 0,
			right: node.attrs.indentRight ?? 0,
			firstLine: node.attrs.indentFirstLine ?? 0,
		}
	}

	return NO_INDENT
}

function sameIndent(a: BlockIndent, b: BlockIndent): boolean {
	return a.left === b.left && a.right === b.right && a.firstLine === b.firstLine
}
const LIST_ITEMS = ['listItem', 'taskItem'] as const
export function indentSelection(editor: Editor | null): void {
	if (!editor) return
	for (const item of LIST_ITEMS) {
		if (editor.can().sinkListItem(item)) {
			editor.chain().focus().sinkListItem(item).run()
			return
		}
	}
	editor.chain().focus().shiftBlockIndent(INDENT_STEP).run()
}
export function outdentSelection(editor: Editor | null): void {
	if (!editor) return
	for (const item of LIST_ITEMS) {
		if (editor.can().liftListItem(item)) {
			editor.chain().focus().liftListItem(item).run()
			return
		}
	}
	editor.chain().focus().shiftBlockIndent(-INDENT_STEP).run()
}
export function useBlockIndent(editor: Editor | null): BlockIndent {
	const [indent, setIndent] = useState<BlockIndent>(NO_INDENT)

	useEffect(() => {
		if (!editor) {
			setIndent(NO_INDENT)
			return
		}

		const sync = () => setIndent((current) => {
			const next = blockIndentAt(editor)
			return sameIndent(current, next) ? current : next
		})

		sync()
		editor.on('transaction', sync)
		return () => {
			editor.off('transaction', sync)
		}
	}, [editor])

	return indent
}
