'use client'

import {
	CheckSquare,
	Code,
	Code2,
	FileText,
	Highlighter,
	Image as ImageIcon,
	Link2,
	List,
	Minus,
	Quote,
	Sigma,
	SquarePlus,
	Table as TableIcon,
} from 'lucide-react'
import { DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { useEditorInstance } from '@/features/editor/editor-context'
import { promptForLink } from '@/features/editor/link'
import { isInsideTable, tableRepeatsHeader } from '@/features/editor/table-header-repeat'
import { useSessions } from '@/features/sessions/session-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { Item, Menu, run } from './menu-shell'

export function InsertMenu({ onInsertImage }: { onInsertImage: () => void }) {
	const { editor } = useEditorInstance()
	const { activeId } = useSessions()
	const keys = useShortcutLabel()

	return (
		<Menu label="Sisip" icon={<SquarePlus className="h-4 w-4" />}>
			{({ close }) => (
				<>
					<Item icon={<ImageIcon className="h-4 w-4" />} onSelect={() => run(close, () => onInsertImage())}>
						Gambar…
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
					<Item
						icon={<Highlighter className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().setCallout('info').run())}
					>
						Callout…
					</Item>
					<Item
						icon={<Quote className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().toggleBlockquote().run())}
					>
						Kutipan
					</Item>
					<Item
						icon={<Code className="h-4 w-4" />}
						onSelect={() =>
							run(close, () => editor?.chain().focus().toggleCodeBlock({ language: 'plaintext' }).run())
						}
					>
						Teks polos
					</Item>
					<Item
						icon={<Code2 className="h-4 w-4" />}
						onSelect={() =>
							run(close, () => editor?.chain().focus().toggleCodeBlock({ language: 'javascript' }).run())
						}
					>
						Blok kode
					</Item>
					<Item
						icon={<Sigma className="h-4 w-4" />}
						onSelect={() =>
							run(close, () => editor?.chain().focus().toggleCodeBlock({ language: 'mermaid' }).run())
						}
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
					<Item
						icon={<TableIcon className="h-4 w-4" />}
						onSelect={() =>
							run(close, () =>
								editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
							)
						}
					>
						Tabel 3×3
					</Item>
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
