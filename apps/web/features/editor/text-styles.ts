import type { Editor } from '@tiptap/react'

/**
 * Daftar pilihan yang muncul di toolbar, dipisah dari komponennya supaya
 * menu bar Format dan toolbar memakai sumber yang sama.
 */

export interface ParagraphStyle {
	id: string
	label: string
	apply: (editor: Editor) => void
	isActive: (editor: Editor) => boolean
	previewStyle: React.CSSProperties
}

export const PARAGRAPH_STYLES: ParagraphStyle[] = [
	{
		id: 'paragraph',
		label: 'Teks biasa',
		apply: (editor) => editor.chain().focus().setParagraph().run(),
		isActive: (editor) => editor.isActive('paragraph'),
		previewStyle: { fontSize: '0.875rem' },
	},
	{
		id: 'h1',
		label: 'Judul 1',
		apply: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
		isActive: (editor) => editor.isActive('heading', { level: 1 }),
		previewStyle: { fontSize: '1.35rem', fontWeight: 700 },
	},
	{
		id: 'h2',
		label: 'Judul 2',
		apply: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
		isActive: (editor) => editor.isActive('heading', { level: 2 }),
		previewStyle: { fontSize: '1.15rem', fontWeight: 600 },
	},
	{
		id: 'h3',
		label: 'Judul 3',
		apply: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
		isActive: (editor) => editor.isActive('heading', { level: 3 }),
		previewStyle: { fontSize: '1rem', fontWeight: 600 },
	},
]

/** Font web-safe agar dokumen tampil sama tanpa perlu memuat berkas font. */
export const FONT_FAMILIES = [
	{ value: 'Inter, sans-serif', label: 'Inter' },
	{ value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
	{ value: 'Georgia, serif', label: 'Georgia' },
	{ value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
	{ value: '"Courier New", Courier, monospace', label: 'Courier New' },
	{ value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
] as const

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72] as const

export const LINE_HEIGHTS = [
	{ value: '1', label: 'Rapat (1,0)' },
	{ value: '1.15', label: 'Normal (1,15)' },
	{ value: '1.5', label: 'Longgar (1,5)' },
	{ value: '2', label: 'Ganda (2,0)' },
] as const
