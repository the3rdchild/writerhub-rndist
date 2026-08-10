'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
	Columns2,
	GripVertical,
	Merge,
	Scissors,
	Table as TableIcon,
	Trash2,
	type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'

/**
 * Bilah kontrol yang muncul saat kursor berada di dalam tabel.
 *
 * TableKit (Tiptap) sudah menyediakan semua perintah - menyisipkan/menghapus
 * baris & kolom, menggabung/memecah sel, mengubah kepala. Komponen ini hanya
 * menampilkannya sebagai tombol, jadi tidak ada logika tabel sendiri.
 *
 * Ditempatkan sebagai portal mengambang dekat tabel (ditangani pemanggil) atau
 * di-render inline di bawah toolbar utama - keduanya bekerja.
 */

function CellAlignControl({ editor }: { editor: Editor }) {
	return (
		<Dropdown
			trigger={({ toggle, open, id }) => (
				<button
					type="button"
					onClick={toggle}
					aria-label="Perataan sel"
					title="Perataan sel"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<Columns2 className="h-4 w-4" />
				</button>
			)}
		>
			{({ close }) => (
				<>
					<DropdownItem onSelect={() => { editor.chain().focus().setCellAttribute('textAlign', 'left').run(); close() }}>
						Rata kiri
					</DropdownItem>
					<DropdownItem onSelect={() => { editor.chain().focus().setCellAttribute('textAlign', 'center').run(); close() }}>
						Rata tengah
					</DropdownItem>
					<DropdownItem onSelect={() => { editor.chain().focus().setCellAttribute('textAlign', 'right').run(); close() }}>
						Rata kanan
					</DropdownItem>
				</>
			)}
		</Dropdown>
	)
}

function Btn({
	icon: Icon,
	label,
	onClick,
}: {
	icon: LucideIcon
	label: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={onClick}
			className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
		>
			<Icon className="h-4 w-4" />
		</button>
	)
}

function Divider() {
	return <div className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
}

export function TableControls({ editor }: { editor: Editor | null }) {
	// Hanya render saat di dalam tabel. useEditorState membatasi render ulang.
	const inTable = useEditorState({
		editor,
		selector: ({ editor: instance }) => {
			if (!instance || instance.isDestroyed) return false
			return instance.isActive('table')
		},
	})
	const [openMenus] = useState(false)
	void openMenus

	if (!editor || !inTable) return null

	return (
		<div
			className={cn(
				'flex flex-wrap items-center gap-0.5 rounded-full border border-line bg-surface px-3 py-1.5 shadow-sm',
			)}
			// Menahan mousedown supaya seleksi sel tabel tidak hilang saat diklik.
			onMouseDown={(e) => e.preventDefault()}
		>
			<span className="px-1 text-xs font-medium text-muted">
				<TableIcon className="mr-1 inline h-3.5 w-3.5" />
				Tabel
			</span>
			<Divider />
			<Btn label="Sisipkan baris di atas" icon={GripVertical} onClick={() => editor.chain().focus().addRowBefore().run()} />
			<Btn label="Sisipkan baris di bawah" icon={GripVertical} onClick={() => editor.chain().focus().addRowAfter().run()} />
			<Btn label="Sisipkan kolom di kiri" icon={Columns2} onClick={() => editor.chain().focus().addColumnBefore().run()} />
			<Btn label="Sisipkan kolom di kanan" icon={Columns2} onClick={() => editor.chain().focus().addColumnAfter().run()} />
			<Divider />
			<Btn label="Hapus baris" icon={Trash2} onClick={() => editor.chain().focus().deleteRow().run()} />
			<Btn label="Hapus kolom" icon={Trash2} onClick={() => editor.chain().focus().deleteColumn().run()} />
			<Divider />
			<Btn label="Gabungkan sel" icon={Merge} onClick={() => editor.chain().focus().mergeCells().run()} />
			<Btn label="Pisahkan sel" icon={Scissors} onClick={() => editor.chain().focus().splitCell().run()} />
			<Divider />
			<Dropdown
				trigger={({ toggle, open, id }) => (
					<button
						type="button"
						onClick={toggle}
						aria-label="Kepala tabel"
						title="Kepala tabel"
						aria-haspopup="menu"
						aria-expanded={open}
						aria-controls={id}
						className="flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Kepala
					</button>
				)}
			>
				{({ close }) => (
					<>
						<DropdownItem onSelect={() => { editor.chain().focus().toggleHeaderRow().run(); close() }}>
							Baris kepala
						</DropdownItem>
						<DropdownItem onSelect={() => { editor.chain().focus().toggleHeaderColumn().run(); close() }}>
							Kolom kepala
						</DropdownItem>
						<DropdownItem onSelect={() => { editor.chain().focus().toggleHeaderCell().run(); close() }}>
							Sel kepala
						</DropdownItem>
					</>
				)}
			</Dropdown>
			<CellAlignControl editor={editor} />
			<Divider />
			<Btn
				label="Hapus tabel"
				icon={Trash2}
				onClick={() => editor.chain().focus().deleteTable().run()}
			/>
		</div>
	)
}
