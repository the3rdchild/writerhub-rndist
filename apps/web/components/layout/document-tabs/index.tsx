'use client'

import { ChevronLeft, Files, Plus } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { OutlineTree } from './outline-tree'
import { TabInteractionsProvider, useTabInteractions } from './tab-interactions'
import { TabRow } from './tab-row'

export function DocumentTabsSidebar() {
	return (
		<TabInteractionsProvider>
			<SidebarBody />
		</TabInteractionsProvider>
	)
}

function SidebarBody() {
	const { documents, activeDocId, newSession } = useSessions()
	const { update } = useSettings()
	const { sessions, activeId, outline, pendingDelete, confirmDelete, cancelDelete, scrollToHeading } =
		useTabInteractions()

	const activeDoc = documents.find((document) => document.id === activeDocId) ?? null

	return (
		<aside className="flex w-[248px] shrink-0 flex-col overflow-y-auto pb-6 pl-1 pr-2">
			<div className="flex items-center px-1 pb-1 pt-1">
				<button
					type="button"
					aria-label="Sembunyikan tab dokumen"
					title="Sembunyikan tab dokumen"
					onClick={() => update({ showDocumentTabs: false })}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<ChevronLeft className="h-[18px] w-[18px]" />
				</button>
			</div>

			{activeDoc && (
				<div className="flex items-center gap-2 px-3 pb-3">
					<Files className="h-4 w-4 shrink-0 text-subtle" />
					<h2 className="truncate text-sm font-medium text-foreground" title={activeDoc.title}>
						{activeDoc.title}
					</h2>
				</div>
			)}

			<div className="flex items-center justify-between gap-1 pb-1 pl-3 pr-1">
				<h2 className="text-sm font-medium text-muted">Tab</h2>
				<button
					type="button"
					aria-label="Tab baru"
					title="Tab baru"
					onClick={newSession}
					className="flex h-7 w-7 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>

			<ul className="flex flex-col gap-0.5">
				{sessions.map((tab, index) => (
					<li key={tab.id}>
						<TabRow tab={tab} index={index} />

						{tab.id === activeId && tab.outlineExpanded && (
							<OutlineTree items={outline.items} activePos={outline.activePos} onSelect={scrollToHeading} />
						)}
					</li>
				))}
			</ul>

			<ConfirmDialog
				open={pendingDelete !== null}
				danger
				title="Hapus tab ini?"
				description={
					<>
						Naskah <strong className="text-foreground">{pendingDelete && sessionLabel(pendingDelete)}</strong>{' '}
						ikut terhapus, termasuk komentar di dalamnya. Tidak ada jalan kembali.
					</>
				}
				confirmLabel="Hapus"
				onConfirm={confirmDelete}
				onCancel={cancelDelete}
			/>
		</aside>
	)
}
