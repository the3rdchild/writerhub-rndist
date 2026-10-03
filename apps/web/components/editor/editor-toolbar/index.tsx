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
	TableOfContents,
	Underline as UnderlineIcon,
	Undo2,
} from 'lucide-react'
import { TableSizeButton } from '@/components/editor/table-size-picker'
import { insertFootnoteAndEdit } from '@/features/editor/footnote'
import { promptForImage } from '@/features/editor/image-insert'
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
				label="Undo"
				disabled={isOff || !active?.canUndo}
				onClick={() => editor?.chain().focus().undo().run()}
			/>
			<IconButton
				icon={Redo2}
				label="Redo"
				disabled={isOff || !active?.canRedo}
				onClick={() => editor?.chain().focus().redo().run()}
			/>

			<Divider />

			<TextStyleControls editor={editor} disabled={isOff} state={active} />

			<Divider />

			<IconButton
				icon={Bold}
				label="Bold"
				active={active?.bold}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleBold().run()}
			/>
			<IconButton
				icon={Italic}
				label="Italic"
				active={active?.italic}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleItalic().run()}
			/>
			<IconButton
				icon={UnderlineIcon}
				label="Underline"
				active={active?.underline}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleUnderline().run()}
			/>
			<IconButton
				icon={Strikethrough}
				label="Strikethrough"
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
				label="Link"
				active={active?.link}
				disabled={isOff}
				onClick={() => editor && promptForLink(editor)}
			/>
			<IconButton
				icon={ImageIcon}
				label="Image"
				disabled={isOff}
				onClick={() => editor && promptForImage(editor)}
			/>
			<TableSizeButton editor={editor} disabled={isOff} />
			<IconButton
				icon={Code2}
				label="Code block"
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
				label="Two columns"
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
				label="Footnote"
				disabled={isOff}
				onClick={() => editor && insertFootnoteAndEdit(editor)}
			/>

			<Divider />

			<IconButton icon={Search} label="Find & replace" disabled={isOff} onClick={() => onOpenSearch?.()} />
			<IconButton
				icon={TableOfContents}
				label="Table of contents"
				disabled={isOff}
				onClick={() => onOpenToc?.()}
			/>

			<Divider />

			<AlignControls editor={editor} disabled={isOff} state={active} />
			<LineSpacingControl editor={editor} disabled={isOff} />

			<Divider />

			<IconButton
				icon={CheckSquare}
				label="Checklist"
				active={active?.taskList}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleTaskList().run()}
			/>
			<IconButton
				icon={List}
				label="Bulleted list"
				active={active?.bulletList}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleBulletList().run()}
			/>
			<IconButton
				icon={ListOrdered}
				label="Numbered list"
				active={active?.orderedList}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleOrderedList().run()}
			/>
			<IconButton
				icon={Quote}
				label="Quote"
				active={active?.blockquote}
				disabled={isOff}
				onClick={() => editor?.chain().focus().toggleBlockquote().run()}
			/>

			<Divider />

			{/* Di dalam daftar, indentasi berarti berpindah tingkat; di luar daftar ia
			    menggeser blok - hasil keduanya terlihat di penggaris. */}
			<IconButton
				icon={Outdent}
				label="Decrease indent"
				disabled={isOff}
				onClick={() => outdentSelection(editor)}
			/>
			<IconButton
				icon={Indent}
				label="Increase indent"
				disabled={isOff}
				onClick={() => indentSelection(editor)}
			/>
			<IconButton
				icon={RemoveFormatting}
				label="Clear formatting"
				disabled={isOff}
				onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
			/>
		</div>
	)
}
