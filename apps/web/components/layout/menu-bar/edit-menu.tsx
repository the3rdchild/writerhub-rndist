'use client'
import { Eraser, FileText, Pencil, Redo2, Undo2 } from 'lucide-react'
import { DropdownSeparator } from '@/components/ui/dropdown'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { Item, Menu, run } from './menu-shell'

export function EditMenu() {
	const { editor } = useEditorInstance()
	const { state, dispatch } = useDocument()
	const keys = useShortcutLabel()

	return (
		<Menu label="Edit" icon={<Pencil className="h-4 w-4" />}>
			{({ close }) => (
				<>
					<Item
						icon={<Undo2 className="h-4 w-4" />}
						disabled={!editor?.can().undo()}
						shortcut={keys('doc.undo')}
						onSelect={() => run(close, () => editor?.chain().focus().undo().run())}
					>
						Urungkan
					</Item>
					<Item
						icon={<Redo2 className="h-4 w-4" />}
						disabled={!editor?.can().redo()}
						shortcut={keys('doc.redo')}
						onSelect={() => run(close, () => editor?.chain().focus().redo().run())}
					>
						Ulangi
					</Item>
					<DropdownSeparator />
					<Item
						icon={<FileText className="h-4 w-4" />}
						shortcut={keys('doc.selectAll')}
						onSelect={() => run(close, () => editor?.chain().focus().selectAll().run())}
					>
						Pilih semua
					</Item>
					<Item
						icon={<FileText className="h-4 w-4" />}
						onSelect={() => run(close, () => navigator.clipboard.writeText(state.text))}
					>
						Salin seluruh teks
					</Item>
					<DropdownSeparator />
					<Item
						icon={<Eraser className="h-4 w-4" />}
						onSelect={() => run(close, () => dispatch({ type: 'clear' }))}
					>
						Kosongkan dokumen
					</Item>
				</>
			)}
		</Menu>
	)
}
