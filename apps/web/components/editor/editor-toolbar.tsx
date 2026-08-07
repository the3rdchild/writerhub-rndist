'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	Baseline,
	Bold,
	CheckSquare,
	Highlighter,
	Image as ImageIcon,
	Indent,
	Italic,
	Link as LinkIcon,
	List,
	ListOrdered,
	type LucideIcon,
	Minus,
	Outdent,
	Plus,
	Quote,
	Redo2,
	RemoveFormatting,
	Strikethrough,
	Table as TableIcon,
	TextQuote,
	Underline as UnderlineIcon,
	Undo2,
} from 'lucide-react'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { ColorPicker } from './color-picker'
import { ToolbarSelect } from '@/components/ui/toolbar-select'
import {
	DEFAULT_FONT_FAMILY,
	FONT_CATEGORY_LABELS,
	FONT_FAMILIES,
	fontFamilyLabel,
} from '@/features/editor/font-catalog'
import { FONT_SIZES, LINE_HEIGHTS, PARAGRAPH_STYLES } from '@/features/editor/text-styles'
import { INDENT_STEP } from '@/features/editor/indent'
import { promptForLink } from '@/features/editor/link'
import { ZOOM_LEVELS } from '@/features/editor/page-geometry'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

const DEFAULT_FONT_SIZE = 11

/**
 * Satu tombol, dua arti.
 *
 * Di dalam daftar, indentasi adalah tingkat butir - memakai margin di sana akan
 * merusak penomoran. Di luar daftar tidak ada tingkat apa pun untuk dinaiki,
 * jadi yang digeser adalah blok itu sendiri.
 */
function indent(editor: Editor | null): void {
	if (!editor) return
	if (editor.can().sinkListItem('listItem')) editor.chain().focus().sinkListItem('listItem').run()
	else editor.chain().focus().shiftBlockIndent(INDENT_STEP).run()
}

function outdent(editor: Editor | null): void {
	if (!editor) return
	if (editor.can().liftListItem('listItem')) editor.chain().focus().liftListItem('listItem').run()
	else editor.chain().focus().shiftBlockIndent(-INDENT_STEP).run()
}

interface ToolbarState {
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
}

export function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
	const { settings, update } = useSettings()

	// useEditorState hanya me-render ulang saat nilai terpilih berubah - tanpa ini
	// seluruh toolbar ikut render pada setiap ketukan tombol.
	const active = useEditorState({
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
				style: PARAGRAPH_STYLES.find((item) => item.isActive(instance))?.id ?? 'paragraph',
				fontFamily: String(attributes.fontFamily ?? DEFAULT_FONT_FAMILY),
				fontSize: Number.isFinite(parsedSize) ? parsedSize : DEFAULT_FONT_SIZE,
				color: attributes.color as string | undefined,
				highlight: instance.getAttributes('highlight').color as string | undefined,
				canUndo: instance.can().undo(),
				canRedo: instance.can().redo(),
			}
		},
	})

	const isOff = disabled || !editor
	const setFontSize = (size: number) => editor?.chain().focus().setFontSize(`${size}pt`).run()

	return (
		<div className="flex flex-wrap items-center gap-0.5 rounded-full border border-line bg-surface px-3 py-1.5">
			<IconButton icon={Undo2} label="Urungkan" disabled={isOff || !active?.canUndo} onClick={() => editor?.chain().focus().undo().run()} />
			<IconButton icon={Redo2} label="Ulangi" disabled={isOff || !active?.canRedo} onClick={() => editor?.chain().focus().redo().run()} />

			<Divider />

			<ToolbarSelect
				label="Perbesaran"
				width={78}
				value={settings.zoom}
				disabled={isOff}
				options={ZOOM_LEVELS.map((level) => ({ value: level, label: `${Math.round(level * 100)}%` }))}
				onChange={(zoom) => update({ zoom })}
			/>

			<Divider />

			<ToolbarSelect
				label="Gaya paragraf"
				width={128}
				value={active?.style ?? 'paragraph'}
				disabled={isOff}
				options={PARAGRAPH_STYLES.map((style) => ({
					value: style.id,
					label: style.label,
					previewStyle: style.previewStyle,
				}))}
				onChange={(id) => {
					const style = PARAGRAPH_STYLES.find((item) => item.id === id)
					if (editor && style) style.apply(editor)
				}}
			/>

			<Divider />

			<ToolbarSelect
				label="Jenis huruf"
				width={146}
				value={active?.fontFamily ?? DEFAULT_FONT_FAMILY}
				disabled={isOff}
				// Naskah impor bisa memakai huruf di luar daftar - kotaknya tetap
				// menyebut nama huruf itu alih-alih tumpukan CSS mentahnya.
				fallbackLabel={fontFamilyLabel(active?.fontFamily ?? DEFAULT_FONT_FAMILY)}
				options={FONT_FAMILIES.map((font) => ({
					value: font.value,
					label: font.label,
					group: FONT_CATEGORY_LABELS[font.category],
					// Setiap nama ditulis dengan hurufnya sendiri: memilih font dari
					// daftar nama yang seragam berarti menebak-nebak.
					previewStyle: { fontFamily: font.value },
				}))}
				onChange={(value) => editor?.chain().focus().setFontFamily(value).run()}
			/>

			<Divider />

			{/* Ukuran huruf: tombol −/+ untuk penyesuaian cepat, daftar untuk lompat jauh. */}
			<IconButton
				icon={Minus}
				label="Perkecil huruf"
				disabled={isOff}
				onClick={() => setFontSize(Math.max(6, (active?.fontSize ?? DEFAULT_FONT_SIZE) - 1))}
			/>
			<ToolbarSelect
				label="Ukuran huruf"
				width={58}
				value={active?.fontSize ?? DEFAULT_FONT_SIZE}
				disabled={isOff}
				options={FONT_SIZES.map((size) => ({ value: size, label: String(size) }))}
				onChange={setFontSize}
			/>
			<IconButton
				icon={Plus}
				label="Perbesar huruf"
				disabled={isOff}
				onClick={() => setFontSize(Math.min(96, (active?.fontSize ?? DEFAULT_FONT_SIZE) + 1))}
			/>

			<Divider />

			<IconButton icon={Bold} label="Tebal" active={active?.bold} disabled={isOff} onClick={() => editor?.chain().focus().toggleBold().run()} />
			<IconButton icon={Italic} label="Miring" active={active?.italic} disabled={isOff} onClick={() => editor?.chain().focus().toggleItalic().run()} />
			<IconButton icon={UnderlineIcon} label="Garis bawah" active={active?.underline} disabled={isOff} onClick={() => editor?.chain().focus().toggleUnderline().run()} />
			<IconButton icon={Strikethrough} label="Coret" active={active?.strike} disabled={isOff} onClick={() => editor?.chain().focus().toggleStrike().run()} />

			<ColorControls editor={editor} color={active?.color} highlight={active?.highlight} />

			<Divider />

			<IconButton icon={LinkIcon} label="Tautan" active={active?.link} disabled={isOff} onClick={() => editor && promptForLink(editor)} />
			<IconButton icon={ImageIcon} label="Gambar" disabled={isOff} onClick={() => editor && insertImage(editor)} />
			<IconButton
				icon={TableIcon}
				label="Tabel"
				disabled={isOff}
				onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
			/>

			<Divider />

			<AlignControls editor={editor} disabled={isOff} state={active} />
			<LineHeightControl editor={editor} disabled={isOff} />

			<Divider />

			<IconButton icon={CheckSquare} label="Daftar centang" active={active?.taskList} disabled={isOff} onClick={() => editor?.chain().focus().toggleTaskList().run()} />
			<IconButton icon={List} label="Daftar butir" active={active?.bulletList} disabled={isOff} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
			<IconButton icon={ListOrdered} label="Daftar nomor" active={active?.orderedList} disabled={isOff} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
			<IconButton icon={Quote} label="Kutipan" active={active?.blockquote} disabled={isOff} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />

			<Divider />

			{/* Di dalam daftar, indentasi berarti berpindah tingkat; di luar daftar ia
			    menggeser blok - hasil keduanya terlihat di penggaris. */}
			<IconButton icon={Outdent} label="Kurangi indentasi" disabled={isOff} onClick={() => outdent(editor)} />
			<IconButton icon={Indent} label="Tambah indentasi" disabled={isOff} onClick={() => indent(editor)} />
			<IconButton
				icon={RemoveFormatting}
				label="Hapus format"
				disabled={isOff}
				onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
			/>
		</div>
	)
}

function ColorControls({
	editor,
	color,
	highlight,
}: {
	editor: Editor | null
	color?: string
	highlight?: string
}) {
	return (
		<>
			<ColorPicker
				icon={<Baseline className="h-4 w-4" />}
				label="Warna teks"
				value={color}
				clearLabel="Warna bawaan"
				onSelect={(value) => editor?.chain().focus().setColor(value).run()}
				onClear={() => editor?.chain().focus().unsetColor().run()}
			/>
			<ColorPicker
				icon={<Highlighter className="h-4 w-4" />}
				label="Warna sorotan"
				value={highlight}
				clearLabel="Tanpa sorotan"
				onSelect={(value) => editor?.chain().focus().toggleHighlight({ color: value }).run()}
				onClear={() => editor?.chain().focus().unsetHighlight().run()}
			/>
		</>
	)
}

function AlignControls({
	editor,
	disabled,
	state,
}: {
	editor: Editor | null
	disabled?: boolean
	state: ToolbarState | null
}) {
	const options = [
		{ icon: AlignLeft, label: 'Rata kiri', value: 'left', active: state?.alignLeft },
		{ icon: AlignCenter, label: 'Rata tengah', value: 'center', active: state?.alignCenter },
		{ icon: AlignRight, label: 'Rata kanan', value: 'right', active: state?.alignRight },
		{ icon: AlignJustify, label: 'Rata kanan-kiri', value: 'justify', active: state?.alignJustify },
	] as const

	return (
		<>
			{options.map((option) => (
				<IconButton
					key={option.value}
					icon={option.icon}
					label={option.label}
					active={option.active}
					disabled={disabled}
					onClick={() => editor?.chain().focus().setTextAlign(option.value).run()}
				/>
			))}
		</>
	)
}

function LineHeightControl({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
	return (
		<Dropdown
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					disabled={disabled}
					aria-label="Spasi baris"
					title="Spasi baris"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors',
						open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)] hover:text-foreground',
						disabled && 'cursor-not-allowed opacity-40',
					)}
				>
					<TextQuote className="h-4 w-4" />
				</button>
			)}
		>
			{({ close }) => (
				<>
					{LINE_HEIGHTS.map((option) => (
						<DropdownItem
							key={option.value}
							onSelect={() => {
								editor?.chain().focus().setLineHeight(option.value).run()
								close()
							}}
						>
							{option.label}
						</DropdownItem>
					))}
				</>
			)}
		</Dropdown>
	)
}

function IconButton({
	icon: Icon,
	label,
	onClick,
	active,
	disabled,
}: {
	icon: LucideIcon
	label: string
	onClick: () => void
	active?: boolean
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
				active
					? 'bg-accent/15 text-accent'
					: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
				disabled && 'cursor-not-allowed opacity-40',
			)}
		>
			<Icon className="h-4 w-4" />
		</button>
	)
}

function Divider() {
	return <div className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
}

function insertImage(editor: Editor) {
	const url = window.prompt('URL gambar:')
	if (url) editor.chain().focus().setImage({ src: url }).run()
}
