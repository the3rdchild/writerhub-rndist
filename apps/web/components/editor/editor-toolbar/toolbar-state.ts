'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { DEFAULT_FONT_FAMILY } from '@/features/editor/font-catalog'
import { ALL_PARAGRAPH_STYLES } from '@/features/editor/text-styles'

export const DEFAULT_FONT_SIZE = 11

/**
 * `editor.can()` melempar saat dokumen sedang dalam keadaan tak konsisten -
 * misalnya di tengah transaksi kolaborasi. Toolbar cukup menonaktifkan
 * tombolnya, bukan ikut jatuh.
 */
export function safeCan(check: () => boolean): boolean {
	try {
		return check()
	} catch {
		return false
	}
}

export interface ToolbarState {
	bold: boolean
	italic: boolean
	underline: boolean
	strike: boolean
	bulletList: boolean
	orderedList: boolean
	taskList: boolean
	blockquote: boolean
	link: boolean
	alignLeft: boolean
	alignCenter: boolean
	alignRight: boolean
	alignJustify: boolean
	style: string
	fontFamily: string
	fontSize: number
	color?: string
	highlight?: string
	canUndo: boolean
	canRedo: boolean
	columns: boolean
	hasSelection: boolean
}

/** Membaca seluruh keadaan yang ditampilkan toolbar dalam satu langganan. */
export function useToolbarState(editor: Editor | null): ToolbarState | null {
	return useEditorState({
		editor,
		selector: ({ editor: instance }): ToolbarState | null => {
			if (!instance || instance.isDestroyed) return null

			const attributes = instance.getAttributes('textStyle')
			const rawSize = String(attributes.fontSize ?? '')
			const parsedSize = Number.parseFloat(rawSize)

			return {
				bold: instance.isActive('bold'),
				italic: instance.isActive('italic'),
				underline: instance.isActive('underline'),
				strike: instance.isActive('strike'),
				bulletList: instance.isActive('bulletList'),
				orderedList: instance.isActive('orderedList'),
				taskList: instance.isActive('taskList'),
				blockquote: instance.isActive('blockquote'),
				link: instance.isActive('link'),
				alignLeft: instance.isActive({ textAlign: 'left' }),
				alignCenter: instance.isActive({ textAlign: 'center' }),
				alignRight: instance.isActive({ textAlign: 'right' }),
				alignJustify: instance.isActive({ textAlign: 'justify' }),
				style: ALL_PARAGRAPH_STYLES.find((item) => item.isActive(instance))?.id ?? 'paragraph',
				fontFamily: String(attributes.fontFamily ?? DEFAULT_FONT_FAMILY),
				fontSize: Number.isFinite(parsedSize) ? parsedSize : DEFAULT_FONT_SIZE,
				color: attributes.color as string | undefined,
				highlight: instance.getAttributes('highlight').color as string | undefined,
				canUndo: safeCan(() => instance.can().undo()),
				canRedo: safeCan(() => instance.can().redo()),
				hasSelection: !instance.state.selection.empty,
				columns: instance.isActive('columns'),
			}
		},
	})
}
