'use client'

import type { Editor } from '@tiptap/react'
import { List } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TableOfContentDataItem } from '@tiptap/extension-table-of-contents'
import { cn } from '@/lib/utils'
export function TocPanel({ editor, onClose }: { editor: Editor; onClose?: () => void }) {
	const [items, setItems] = useState<TableOfContentDataItem[]>([])

	useEffect(() => {
		const read = () => {
			const storage = (editor.storage as { tableOfContents?: { content: TableOfContentDataItem[] } })
				.tableOfContents
			setItems(storage?.content ?? [])
		}
		read()
		editor.on('transaction', read)
		return () => {
			editor.off('transaction', read)
		}
	}, [editor])

	const jump = (item: TableOfContentDataItem) => {
		editor.commands.focus()
		editor.commands.setTextSelection(item.pos + 1)
		const el = editor.view.dom.querySelector(`[data-toc-id="${item.id}"]`)
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b border-line px-4 py-3">
				<List className="h-4 w-4 text-muted" />
				<h2 className="text-sm font-semibold">Daftar Isi</h2>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						aria-label="Tutup daftar isi"
						className="ml-auto text-sm text-muted transition-colors hover:text-foreground"
					>
						Tutup
					</button>
				)}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{items.length === 0 ? (
					<p className="px-3 py-6 text-center text-xs text-muted">
						Tambahkan judul (Heading) untuk membuat daftar isi.
					</p>
				) : (
					<ul className="flex flex-col gap-0.5">
						{items.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									onClick={() => jump(item)}
									className={cn(
										'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
										item.isActive
											? 'bg-accent/10 font-medium text-accent'
											: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
									)}
									style={{ paddingLeft: `${0.75 + Math.min(item.level - 1, 6) * 1}rem` }}
								>
									{item.textContent || 'Tanpa judul'}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}
