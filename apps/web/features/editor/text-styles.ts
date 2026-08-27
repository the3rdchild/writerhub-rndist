import type { Editor } from '@tiptap/react'
import { HEADING_LEVELS, VISIBLE_HEADING_LEVELS } from '@/features/editor/heading-extension'

export interface ParagraphStyle {
	id: string
	label: string
	apply: (editor: Editor) => void
	isActive: (editor: Editor) => boolean
	previewStyle: React.CSSProperties
}

const HEADING_FONT_SIZE: Record<number, string> = {
	1: '1.35rem',
	2: '1.15rem',
	3: '1rem',
	4: '0.95rem',
	5: '0.9rem',
	6: '0.85rem',
	7: '0.82rem',
	8: '0.8rem',
	9: '0.78rem',
}

function headingStyle(level: number): ParagraphStyle {
	const typedLevel = level as 1
	return {
		id: `h${level}`,
		label: `Judul ${level}`,
		apply: (editor) => editor.chain().focus().toggleHeading({ level: typedLevel }).run(),
		isActive: (editor) => editor.isActive('heading', { level: typedLevel }),
		previewStyle: { fontSize: HEADING_FONT_SIZE[level] ?? '0.8rem', fontWeight: 600 },
	}
}

export const PARAGRAPH_STYLES: ParagraphStyle[] = [
	{
		id: 'paragraph',
		label: 'Teks biasa',
		apply: (editor) => editor.chain().focus().setParagraph().run(),
		isActive: (editor) => editor.isActive('paragraph'),
		previewStyle: { fontSize: '0.875rem' },
	},
	...VISIBLE_HEADING_LEVELS.map(headingStyle),
]

export const ALL_PARAGRAPH_STYLES: ParagraphStyle[] = [
	PARAGRAPH_STYLES[0],
	...HEADING_LEVELS.map(headingStyle),
]

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72] as const

export const LINE_HEIGHTS = [
	{ value: '1', label: 'Rapat (1,0)' },
	{ value: '1.15', label: 'Normal (1,15)' },
	{ value: '1.5', label: 'Longgar (1,5)' },
	{ value: '2', label: 'Ganda (2,0)' },
] as const
