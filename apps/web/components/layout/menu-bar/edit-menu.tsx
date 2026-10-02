'use client'
import { Eraser, FileText, Pencil, Redo2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownSeparator } from '@/components/ui/dropdown'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { Item, Menu, run } from './menu-shell'

export function EditMenu() {
	const { editor } = useEditorInstance()
	const { state, dispatch } = useDocument()
	const keys = useShortcutLabel()
	const [confirmClear, setConfirmClear] = useState(false)

	/*
	 * Mengosongkan lewat transaksi editor supaya Ctrl+Z mengembalikannya, dan
	 * hanya setelah konfirmasi - dulu satu klik langsung membuang seluruh isi tab
	 * dan ikut mereset judul (uji editor 2 Okt, SHL-8/TKS-20).
	 */
	const clearTab = () => {
		setConfirmClear(false)
		editor?.chain().focus().clearContent(true).run()
		dispatch({ type: 'clear' })
	}

	return (
		<>
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
							onSelect={() => run(close, () => setConfirmClear(true))}
						>
							Kosongkan dokumen…
						</Item>
					</>
				)}
			</Menu>
			<ConfirmDialog
				open={confirmClear}
				danger
				title="Clear this tab?"
				description="All content in this tab will be removed. You can undo this with Ctrl+Z."
				confirmLabel="Clear"
				onConfirm={clearTab}
				onCancel={() => setConfirmClear(false)}
			/>
		</>
	)
}
