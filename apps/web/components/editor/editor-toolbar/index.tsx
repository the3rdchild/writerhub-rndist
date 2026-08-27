'use client'

import type { Editor } from '@tiptap/react'
import {
	Bold,
	CheckSquare,
	Code2,
	Columns2,
	Footprints,
	Image as ImageIcon,
	Indent,
	Italic,
	Link as LinkIcon,
	List,
	ListOrdered,
	MessageSquareText,
	Outdent,
	Quote,
	Redo2,
	RemoveFormatting,
	Search,
	Strikethrough,
	Table as TableIcon,
	Underline as UnderlineIcon,
	Undo2,
} from 'lucide-react'
import { indentSelection, outdentSelection } from '@/features/editor/indent'
import { promptForLink } from '@/features/editor/link'
import { useSettings } from '@/features/settings/settings-context'
import { AlignControls } from './align-controls'
import { CapitalizationControl } from './capitalization-control'
import { ColorControls } from './color-controls'
import { LineSpacingControl } from './line-spacing-control'
import { TextStyleControls } from './text-style-controls'
import { Divider, IconButton } from './toolbar-parts'
import { useToolbarState } from './toolbar-state'

export function EditorToolbar({
	editor,
	disabled,
	onOpenSearch,
	onOpenToc,
}: {
	editor: Editor | null
	disabled?: boolean
	onOpenSearch?: () => void
	onOpenToc?: () => void
}) {
	const { settings, update } = useSettings()
	const active = useToolbarState(editor)

	const isOff = disabled || !editor
	const setFontSize = (size: number) => editor?.chain().focus().setFontSize(`${size}pt`).run()

	return (
		<div className="flex flex-wrap items-center gap-0.5 rounded-full border border-line bg-surface px-3 py-1.5">
			<IconButton
				icon={Undo2}
				label="Urungkan"
				disabled={isOff || !active?.canUndo}
				onClick={() => editor?.chain().focus().undo().run()}
			/>
			<IconButton
				icon={Redo2}
				label="Ulangi"
				disabled={isOff || !active?.canRedo}
				onClick={() => editor?.chain().focus().redo().run()}
			/>

			<Divider />

			<TextStyleControls editor={editor} disabled={isOff} state={active} />

			<Divider />

			<IconButton
				icon={Bold}
				label="Tebal"
				active={active?.bold}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleBold().run()}
			/>
			<IconButton
				icon={Italic}
				label="Miring"
				active={active?.italic}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleItalic().run()}
			/>
			<IconButton
				icon={UnderlineIcon}
				label="Garis bawah"
				active={active?.underline}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleUnderline().run()}
			/>
			<IconButton
				icon={Strikethrough}
				label="Coret"
				active={active?.strike}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleStrike().run()}
			/>

			{/* Dimatikan tanpa seleksi: kapitalisasi bekerja pada teks yang disorot,
			    dan `hasSelection` di sini ikut `useEditorState` jadi selalu terkini. */}
			<CapitalizationControl editor={editor} disabled={isOff || !active?.hasSelection} />

			<ColorControls editor={editor} color={active?.color} highlight={active?.highlight} />

			<Divider />

			<IconButton
				icon={LinkIcon}
				label="Tautan"
				active={active?.link}
				disabled={isOff}
				onClick={() => editor && promptForLink(editor)}
			/>
			<IconButton
				icon={ImageIcon}
				label="Gambar"
				disabled={isOff}
				onClick={() => editor && insertImage(editor)}
			/>
			<IconButton
				icon={TableIcon}
				label="Tabel"
				disabled={isOff}
				onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
			/>
			<IconButton
				icon={Code2}
				label="Blok kode"
				active={editor?.isActive('codeBlock')}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
			/>
			<IconButton
				icon={MessageSquareText}
				label="Callout"
				active={editor?.isActive('callout')}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleCallout('info').run()}
			/>
			{/* Butuh seleksi, sama seperti butir Kolom di menu Format - kecuali saat
			    sudah berada di dalam kolom, di mana tombolnya bertugas keluar lagi. */}
			<IconButton
				icon={Columns2}
				label="Dua kolom"
				active={active?.columns}
				disabled={isOff || !(active?.hasSelection || active?.columns)}
				onClick={() =>
					active?.columns
						? editor?.chain().focus().unsetColumns().run()
						: editor?.chain().focus().setColumns(2).run()
				}
			/>
			<IconButton
				icon={Footprints}
				label="Catatan kaki"
				disabled={isOff}
				onClick={() => editor?.chain().focus().insertFootnote(`fn-${Date.now()}`).run()}
			/>

			<Divider />

			<IconButton icon={Search} label="Cari & ganti" disabled={isOff} onClick={() => onOpenSearch?.()} />
			<IconButton icon={List} label="Daftar isi" disabled={isOff} onClick={() => onOpenToc?.()} />

			<Divider />

			<AlignControls editor={editor} disabled={isOff} state={active} />
			<LineSpacingControl editor={editor} disabled={isOff} />

			<Divider />

			<IconButton
				icon={CheckSquare}
				label="Daftar centang"
				active={active?.taskList}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleTaskList().run()}
			/>
			<IconButton
				icon={List}
				label="Daftar butir"
				active={active?.bulletList}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleBulletList().run()}
			/>
			<IconButton
				icon={ListOrdered}
				label="Daftar nomor"
				active={active?.orderedList}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleOrderedList().run()}
			/>
			<IconButton
				icon={Quote}
				label="Kutipan"
				active={active?.blockquote}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleBlockquote().run()}
			/>

			<Divider />

			{/* Di dalam daftar, indentasi berarti berpindah tingkat; di luar daftar ia
			    menggeser blok - hasil keduanya terlihat di penggaris. */}
			<IconButton
				icon={Outdent}
				label="Kurangi indentasi"
				disabled={isOff}
				onClick={() => outdentSelection(editor)}
			/>
			<IconButton
				icon={Indent}
				label="Tambah indentasi"
				disabled={isOff}
				onClick={() => indentSelection(editor)}
			/>
			<IconButton
				icon={RemoveFormatting}
				label="Hapus format"
				disabled={isOff}
				onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
			/>
		</div>
	)
}

export function insertImage(editor: Editor) {
	const url = window.prompt('URL gambar:')
	if (url) editor.chain().focus().setImage({ src: url }).run()
}
