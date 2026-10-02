'use client'

import {
	CheckSquare,
	Code,
	Code2,
	Columns2,
	FileText,
	Highlighter,
	Image as ImageIcon,
	Link2,
	List,
	Minus,
	Quote,
	Sigma,
	SquarePlus,
	Stamp,
	Table as TableIcon,
} from 'lucide-react'
import { insertTableOfSize, TableSizeGrid } from '@/components/editor/table-size-picker'
import { DropdownLabel, DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { usePanels } from '@/features/analysis/panel-context'
import { CALLOUT_TYPES } from '@/features/editor/callout'
import { insertCodeBlock } from '@/features/editor/code-block'
import { useEditorInstance } from '@/features/editor/editor-context'
import { promptForImage } from '@/features/editor/image-insert'
import { promptForLink } from '@/features/editor/link'
import { isInsideTable, tableRepeatsHeader } from '@/features/editor/table-header-repeat'
import { useSessions } from '@/features/sessions/session-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { Item, Menu, run } from './menu-shell'

export function InsertMenu() {
	const { editor } = useEditorInstance()
	const { activeId } = useSessions()
	const { setActivePanel } = usePanels()
	const keys = useShortcutLabel()

	return (
		<Menu label="Sisip" icon={<SquarePlus className="h-4 w-4" />}>
			{({ close }) => (
				<>
					<Item
						icon={<ImageIcon className="h-4 w-4" />}
						onSelect={() => run(close, () => editor && promptForImage(editor))}
					>
						Gambar…
					</Item>
					{/* Watermark bukan isi naskah melainkan perabot halaman - ia dibuka
					    sebagai panel, bukan disisipkan ke posisi kursor. Tempatnya tetap
					    di sini karena dari sudut pandang penulis, inilah "menyisipkan
					    sesuatu ke halaman". */}
					<Item
						icon={<Stamp className="h-4 w-4" />}
						onSelect={() => run(close, () => setActivePanel('watermark'))}
					>
						Watermark…
					</Item>
					<Item
						icon={<Link2 className="h-4 w-4" />}
						shortcut={keys('text.link')}
						onSelect={() => run(close, () => editor && promptForLink(editor))}
					>
						Tautan…
					</Item>
					<DropdownSeparator />
					<DropdownLabel>Blok</DropdownLabel>
					{/* Jenis dipilih saat menyisip (TKS-14); dulu selalu info. */}
					<Submenu label="Callout" icon={<Highlighter className="h-4 w-4" />}>
						{() => (
							<>
								{CALLOUT_TYPES.map((type) => (
									<Item
										key={type.id}
										icon={<span className="w-4 text-center">{type.emoji}</span>}
										onSelect={() => run(close, () => editor?.chain().focus().setCallout(type.id).run())}
									>
										{type.label}
									</Item>
								))}
							</>
						)}
					</Submenu>
					<Item
						icon={<Quote className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().toggleBlockquote().run())}
					>
						Kutipan
					</Item>
					<Item
						icon={<Code className="h-4 w-4" />}
						onSelect={() => run(close, () => editor && insertCodeBlock(editor, 'plaintext'))}
					>
						Teks polos
					</Item>
					<Item
						icon={<Code2 className="h-4 w-4" />}
						onSelect={() => run(close, () => editor && insertCodeBlock(editor, 'javascript'))}
					>
						Blok kode
					</Item>
					<Item
						icon={<Sigma className="h-4 w-4" />}
						onSelect={() => run(close, () => editor && insertCodeBlock(editor, 'mermaid'))}
					>
						Diagram Mermaid…
					</Item>
					<DropdownSeparator />
					<DropdownLabel>Daftar</DropdownLabel>
					<Item
						icon={<List className="h-4 w-4" />}
						disabled={!activeId}
						onSelect={() => run(close, () => editor?.chain().focus().insertToc({ listKind: 'isi' }).run())}
					>
						Daftar isi
					</Item>
					<Item
						icon={<ImageIcon className="h-4 w-4" />}
						disabled={!activeId}
						onSelect={() => run(close, () => editor?.chain().focus().insertToc({ listKind: 'gambar' }).run())}
					>
						Daftar gambar
					</Item>
					<Item
						icon={<TableIcon className="h-4 w-4" />}
						disabled={!activeId}
						onSelect={() => run(close, () => editor?.chain().focus().insertToc({ listKind: 'tabel' }).run())}
					>
						Daftar tabel
					</Item>
					<Item
						icon={<Code className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().toggleCode().run())}
					>
						Kode (dalam baris)
					</Item>
					<DropdownSeparator />
					<Submenu label="Tabel" icon={<TableIcon className="h-4 w-4" />}>
						{() => (
							<TableSizeGrid
								onPick={(rows, cols) => run(close, () => editor && insertTableOfSize(editor, rows, cols))}
							/>
						)}
					</Submenu>
					<Item
						icon={<Minus className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().setHorizontalRule().run())}
					>
						Garis horizontal
					</Item>
					<Item
						icon={<CheckSquare className="h-4 w-4" />}
						shortcut={keys('para.taskList')}
						onSelect={() => run(close, () => editor?.chain().focus().toggleTaskList().run())}
					>
						Daftar centang
					</Item>
					<Item
						icon={<FileText className="h-4 w-4" />}
						shortcut={keys('doc.pageBreak')}
						onSelect={() => run(close, () => editor?.chain().focus().setPageBreak().run())}
					>
						Halaman baru
					</Item>
					{/* Pindah kolom: di dalam wilayah berkolom ia menutup kolom, di luar
					    itu Word memperlakukannya sebagai pemenggal halaman. */}
					<Item
						icon={<Columns2 className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().setColumnBreak().run())}
					>
						Kolom baru
					</Item>
					<Item
						icon={<TableIcon className="h-4 w-4" />}
						disabled={!isInsideTable(editor)}
						active={tableRepeatsHeader(editor)}
						onSelect={() => run(close, () => editor?.chain().focus().toggleTableHeaderRepeat().run())}
					>
						Ulang header tabel
					</Item>
				</>
			)}
		</Menu>
	)
}
