'use client'

import { ChevronLeft, Copy, FileText, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
	Dropdown,
	DropdownItem,
	DropdownLabel,
	DropdownSeparator,
} from '@/components/ui/dropdown'
import { useEditorInstance } from '@/features/editor/editor-context'
import { type OutlineItem, scrollToOutlineItem, useOutline } from '@/features/editor/use-outline'
import { type Session, sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

/**
 * Ikon tab dibatasi beberapa pilihan, bukan pemilih emoji penuh: gunanya hanya
 * membedakan tab sekilas, dan daftar pendek jauh lebih cepat dipakai.
 */
const TAB_ICONS = ['📄', '📝', '📌', '⭐', '📊', '🔬', '💡', '🗂️'] as const

/**
 * Sidebar tab dokumen.
 *
 * Satu tab adalah satu sesi — daftarnya datang langsung dari penyimpanan sesi,
 * bukan salinan tersendiri, supaya tidak ada dua versi naskah yang sama.
 *
 * Kerangka heading tampil bersarang di bawah tab yang sedang dibuka, bukan
 * sebagai panel terpisah: tab menjawab "naskah mana", kerangka menjawab "bagian
 * mana" — dua pertanyaan berurutan, jadi jawabannya berdekatan.
 */
export function DocumentTabsSidebar() {
	const {
		sessions,
		activeId,
		selectSession,
		newSession,
		renameSession,
		duplicateSession,
		deleteSession,
		setSessionEmoji,
	} = useSessions()
	const { editor } = useEditorInstance()
	const { update } = useSettings()
	const outline = useOutline(editor)
	const [renamingId, setRenamingId] = useState<string | null>(null)

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

			<div className="flex items-center justify-between gap-1 pb-1 pl-3 pr-1">
				<h2 className="text-sm font-medium text-muted">Document tabs</h2>
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
				{sessions.map((tab) => (
					<li key={tab.id}>
						<TabRow
							tab={tab}
							active={tab.id === activeId}
							renaming={renamingId === tab.id}
							canRemove={sessions.length > 1}
							onSelect={() => selectSession(tab.id)}
							onRename={(title) => {
								renameSession(tab.id, title)
								setRenamingId(null)
							}}
							onStartRename={() => setRenamingId(tab.id)}
							onCancelRename={() => setRenamingId(null)}
							onDuplicate={() => duplicateSession(tab.id)}
							onRemove={() => deleteSession(tab.id)}
							onSetIcon={(icon) => setSessionEmoji(tab.id, icon)}
						/>

						{tab.id === activeId && outline.items.length > 0 && (
							<OutlineTree
								items={outline.items}
								activePos={outline.activePos}
								onSelect={(pos) => editor && scrollToOutlineItem(editor, pos)}
							/>
						)}
					</li>
				))}
			</ul>
		</aside>
	)
}

function TabRow({
	tab,
	active,
	renaming,
	canRemove,
	onSelect,
	onRename,
	onStartRename,
	onCancelRename,
	onDuplicate,
	onRemove,
	onSetIcon,
}: {
	tab: Session
	active: boolean
	renaming: boolean
	canRemove: boolean
	onSelect: () => void
	onRename: (title: string) => void
	onStartRename: () => void
	onCancelRename: () => void
	onDuplicate: () => void
	onRemove: () => void
	onSetIcon: (icon: string | null) => void
}) {
	if (renaming) {
		return <TabNameInput initialValue={tab.title} onCommit={onRename} onCancel={onCancelRename} />
	}

	// Naskah yang belum diberi judul dikenali dari baris pertamanya — daftar tab
	// berisi "Untitled document" berulang tidak membantu siapa pun.
	const label = sessionLabel(tab)

	return (
		<div
			className={cn(
				'group flex items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-1 transition-colors',
				active
					? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent'
					: 'text-foreground hover:bg-[var(--overlay-hover)]',
			)}
		>
			<button
				type="button"
				onClick={onSelect}
				onDoubleClick={onStartRename}
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
			>
				<span className="w-4 shrink-0 text-center text-sm leading-none">
					{tab.emoji ?? <FileText className={cn('h-4 w-4', !active && 'text-subtle')} />}
				</span>
				<span className="truncate text-sm" title={label}>
					{label}
				</span>
			</button>

			<Dropdown
				align="end"
				trigger={({ open, toggle, id }) => (
					<button
						type="button"
						onClick={toggle}
						aria-label={`Opsi ${label}`}
						aria-expanded={open}
						aria-controls={id}
						className={cn(
							'flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--overlay-active)]',
							// Menu hanya muncul saat baris disentuh, supaya daftar tetap tenang.
							open || active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
						)}
					>
						<MoreVertical className="h-4 w-4" />
					</button>
				)}
			>
				{({ close }) => (
					<>
						<DropdownItem
							icon={<Pencil className="h-4 w-4" />}
							onSelect={() => {
								close()
								onStartRename()
							}}
						>
							Ganti nama
						</DropdownItem>
						<DropdownItem
							icon={<Copy className="h-4 w-4" />}
							onSelect={() => {
								close()
								onDuplicate()
							}}
						>
							Duplikat
						</DropdownItem>

						<DropdownLabel>Ikon</DropdownLabel>
						<div className="flex flex-wrap gap-0.5 px-2 pb-1.5">
							{TAB_ICONS.map((icon) => (
								<button
									key={icon}
									type="button"
									aria-label={`Ikon ${icon}`}
									onClick={() => {
										close()
										onSetIcon(icon)
									}}
									className={cn(
										'flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors hover:bg-[var(--overlay-hover)]',
										tab.emoji === icon && 'bg-[var(--overlay-active)]',
									)}
								>
									{icon}
								</button>
							))}
							<button
								type="button"
								aria-label="Tanpa ikon"
								title="Tanpa ikon"
								onClick={() => {
									close()
									onSetIcon(null)
								}}
								className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-subtle transition-colors hover:bg-[var(--overlay-hover)]"
							>
								✕
							</button>
						</div>

						<DropdownSeparator />
						<DropdownItem
							icon={<Trash2 className="h-4 w-4" />}
							disabled={!canRemove}
							onSelect={() => {
								close()
								onRemove()
							}}
						>
							Hapus
						</DropdownItem>
					</>
				)}
			</Dropdown>
		</div>
	)
}

function TabNameInput({
	initialValue,
	onCommit,
	onCancel,
}: {
	initialValue: string
	onCommit: (value: string) => void
	onCancel: () => void
}) {
	const [value, setValue] = useState(initialValue)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.select()
	}, [])

	const commit = () => {
		const trimmed = value.trim()
		if (trimmed) onCommit(trimmed)
		else onCancel()
	}

	return (
		<input
			ref={inputRef}
			value={value}
			autoFocus
			onChange={(event) => setValue(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit()
				else if (event.key === 'Escape') onCancel()
			}}
			aria-label="Nama tab"
			className="w-full rounded-lg border border-accent bg-surface-raised px-2.5 py-1.5 text-sm text-foreground outline-none"
		/>
	)
}

/**
 * Kerangka heading. Level dipetakan ke indentasi, bukan ke ukuran huruf, supaya
 * daftar panjang tetap terbaca sebagai satu kolom.
 */
function OutlineTree({
	items,
	activePos,
	onSelect,
}: {
	items: OutlineItem[]
	activePos: number | null
	onSelect: (pos: number) => void
}) {
	return (
		<ul className="mb-1 ml-4 mt-0.5 border-l border-line">
			{items.map((item) => {
				const active = item.pos === activePos
				return (
					<li key={item.pos}>
						<button
							type="button"
							onClick={() => onSelect(item.pos)}
							title={item.text || 'Tanpa judul'}
							style={{ paddingLeft: 10 + (item.level - 1) * 12 }}
							className={cn(
								'-ml-px block w-full truncate border-l-2 py-1 pr-2 text-left text-[13px] transition-colors',
								active
									? 'border-accent text-accent'
									: 'border-transparent text-muted hover:border-line-strong hover:text-foreground',
							)}
						>
							{item.text || 'Tanpa judul'}
						</button>
					</li>
				)
			})}
		</ul>
	)
}
