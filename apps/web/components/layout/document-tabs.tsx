'use client'

import {
	ChevronLeft,
	Cloud,
	CloudAlert,
	CloudOff,
	CloudUpload,
	Copy,
	FileText,
	ListTree,
	Loader2,
	MessageSquare,
	MoreVertical,
	MoveDown,
	MoveUp,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
import { type SyncStatus, useSync } from '@/features/sync/sync-context'
import { cn } from '@/lib/utils'

/**
 * Ikon tab dibatasi beberapa pilihan, bukan pemilih emoji penuh: gunanya hanya
 * membedakan tab sekilas, dan daftar pendek jauh lebih cepat dipakai.
 */
const TAB_ICONS = ['📄', '📝', '📌', '⭐', '📊', '🔬', '💡', '🗂️'] as const

/**
 * Sidebar tab dokumen.
 *
 * Satu tab adalah satu sesi - daftarnya datang langsung dari penyimpanan sesi,
 * bukan salinan tersendiri, supaya tidak ada dua versi naskah yang sama.
 *
 * Kerangka heading tampil bersarang di bawah tab yang sedang dibuka, bukan
 * sebagai panel terpisah: tab menjawab "naskah mana", kerangka menjawab "bagian
 * mana" - dua pertanyaan berurutan, jadi jawabannya berdekatan.
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
		moveSession,
		setSessionOutlineExpanded,
	} = useSessions()
	const { syncStatus, saveToCloud } = useSync()
	const { editor } = useEditorInstance()
	const { update } = useSettings()
	const outline = useOutline(editor)
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [pendingDelete, setPendingDelete] = useState<Session | null>(null)

	/**
	 * Seret memakai DnD bawaan HTML, bukan pustaka: daftarnya satu kolom, pendek,
	 * dan tidak ada yang perlu dipelajari peramban di luar apa yang sudah bisa.
	 */
	const [draggingId, setDraggingId] = useState<string | null>(null)
	const [dragOverId, setDragOverId] = useState<string | null>(null)
	const dragFrom = sessions.findIndex((s) => s.id === draggingId)
	const dragTo = sessions.findIndex((s) => s.id === dragOverId)

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
				{sessions.map((tab, index) => (
					<li key={tab.id}>
						<TabRow
							tab={tab}
							active={tab.id === activeId}
							renaming={renamingId === tab.id}
							canRemove={sessions.length > 1}
							canMoveUp={index > 0}
							canMoveDown={index < sessions.length - 1}
							// Yang dihitung hanya yang belum dibereskan: lencana ini
							// bertanya "masih ada yang perlu dijawab di tab itu?", dan
							// utas yang sudah selesai tidak menjawab apa pun.
							commentCount={tab.comments.filter((thread) => !thread.resolved).length}
							syncState={syncStatus(tab.id)}
							onSaveToCloud={() => void saveToCloud(tab.id)}
							dragging={draggingId === tab.id}
							dropEdge={
								dragOverId === tab.id && draggingId !== null && draggingId !== tab.id
									? dragFrom < dragTo
										? 'bottom'
										: 'top'
									: null
							}
							onDragStart={() => setDraggingId(tab.id)}
							onDragEnterRow={() => setDragOverId(tab.id)}
							onDrop={() => {
								if (draggingId) moveSession(draggingId, tab.id)
								setDraggingId(null)
								setDragOverId(null)
							}}
							onDragEnd={() => {
								setDraggingId(null)
								setDragOverId(null)
							}}
							onMoveUp={() => moveSession(tab.id, sessions[index - 1].id)}
							onMoveDown={() => moveSession(tab.id, sessions[index + 1].id)}
							onSelect={() => {
								// Klik tab yang sudah aktif bukan pindah lagi - ia membuka/
								// menutup daftar isi tab itu. Klik tab lain tetap berarti
								// pindah dokumen, dan tab tujuan selalu mendarat tertutup.
								if (tab.id === activeId) {
									setSessionOutlineExpanded(tab.id, !tab.outlineExpanded)
								} else {
									selectSession(tab.id)
								}
							}}
							onRename={(title) => {
								renameSession(tab.id, title)
								setRenamingId(null)
							}}
							onStartRename={() => setRenamingId(tab.id)}
							onCancelRename={() => setRenamingId(null)}
							onDuplicate={() => duplicateSession(tab.id)}
							onRemove={() => setPendingDelete(tab)}
							onSetIcon={(icon) => setSessionEmoji(tab.id, icon)}
							onToggleOutline={() =>
								setSessionOutlineExpanded(tab.id, !tab.outlineExpanded)
							}
						/>

						{tab.id === activeId && tab.outlineExpanded && (
							<OutlineTree
								items={outline.items}
								activePos={outline.activePos}
								onSelect={(pos) => editor && scrollToOutlineItem(editor, pos)}
							/>
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
				onConfirm={() => {
					if (pendingDelete) deleteSession(pendingDelete.id)
					setPendingDelete(null)
				}}
				onCancel={() => setPendingDelete(null)}
			/>
		</aside>
	)
}

function TabRow({
	tab,
	active,
	renaming,
	canRemove,
	canMoveUp,
	canMoveDown,
	commentCount,
	syncState,
	dragging,
	dropEdge,
	onSelect,
	onRename,
	onStartRename,
	onCancelRename,
	onDuplicate,
	onRemove,
	onSetIcon,
	onToggleOutline,
	onMoveUp,
	onMoveDown,
	onSaveToCloud,
	onDragStart,
	onDragEnterRow,
	onDrop,
	onDragEnd,
}: {
	tab: Session
	active: boolean
	renaming: boolean
	canRemove: boolean
	canMoveUp: boolean
	canMoveDown: boolean
	/** Komentar yang belum dibereskan di tab ini. */
	commentCount: number
	/** Keadaan sinkronisasi tab ini ke cloud. */
	syncState: SyncStatus
	dragging: boolean
	/** Sisi tempat garis penanda jatuh saat tab lain diseret ke sini. */
	dropEdge: 'top' | 'bottom' | null
	onSelect: () => void
	onRename: (title: string) => void
	onStartRename: () => void
	onCancelRename: () => void
	onDuplicate: () => void
	onRemove: () => void
	onSetIcon: (icon: string | null) => void
	onToggleOutline: () => void
	onMoveUp: () => void
	onMoveDown: () => void
	onSaveToCloud: () => void
	onDragStart: () => void
	onDragEnterRow: () => void
	onDrop: () => void
	onDragEnd: () => void
}) {
	if (renaming) {
		return <TabNameInput initialValue={tab.title} onCommit={onRename} onCancel={onCancelRename} />
	}

	// Naskah yang belum diberi judul dikenali dari baris pertamanya - daftar tab
	// berisi "Untitled document" berulang tidak membantu siapa pun.
	const label = sessionLabel(tab)

	return (
		<div
			draggable
			onDragStart={(event) => {
				// Firefox tidak memulai seret sama sekali kalau tidak ada muatan yang
				// disertakan, walaupun tujuan jatuhnya ada di halaman yang sama.
				event.dataTransfer.setData('text/plain', tab.id)
				event.dataTransfer.effectAllowed = 'move'
				onDragStart()
			}}
			onDragEnter={onDragEnterRow}
			// Tanpa preventDefault peramban menolak jatuhnya - bawaan HTML memang
			// menganggap tidak ada tempat yang menerima sampai dikatakan sebaliknya.
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault()
				onDrop()
			}}
			onDragEnd={onDragEnd}
			className={cn(
				'group flex items-center gap-2 rounded-lg border-y-2 border-transparent py-1 pl-2.5 pr-1 transition-colors',
				active
					? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent'
					: 'text-foreground hover:bg-[var(--overlay-hover)]',
				dragging && 'opacity-40',
				dropEdge === 'top' && 'border-t-accent',
				dropEdge === 'bottom' && 'border-b-accent',
			)}
		>
			<button
				type="button"
				onClick={onSelect}
				onDoubleClick={onStartRename}
				// Pada tab aktif tombolnya merangkap pembuka daftar isi, jadi
				// keadaannya perlu terbaca pembaca layar juga.
				aria-expanded={active ? tab.outlineExpanded : undefined}
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
			>
				<span className="w-4 shrink-0 text-center text-sm leading-none">
					{tab.emoji ?? <FileText className={cn('h-4 w-4', !active && 'text-subtle')} />}
				</span>
				<span className="truncate text-sm" title={label}>
					{label}
				</span>
			</button>

			{commentCount > 0 && (
				<span
					title={`${commentCount} komentar belum dibereskan`}
					className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--overlay-active)] px-1.5 text-[11px] leading-5 text-muted"
				>
					<MessageSquare className="h-3 w-3" />
					{commentCount}
				</span>
			)}

			<SyncBadge status={syncState} />

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
						<DropdownItem
							icon={
								syncState === 'saving' ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<CloudUpload className="h-4 w-4" />
								)
							}
							disabled={syncState === 'saving'}
							onSelect={() => {
								close()
								onSaveToCloud()
							}}
						>
							{syncState === 'local' ? 'Simpan ke cloud' : 'Simpan ke cloud sekarang'}
						</DropdownItem>
						<DropdownItem
							icon={<ListTree className="h-4 w-4" />}
							onSelect={() => {
								close()
								onToggleOutline()
							}}
						>
							{tab.outlineExpanded ? 'Sembunyikan daftar isi' : 'Tampilkan daftar isi'}
						</DropdownItem>

						{/*
						 * Naik/turun ada di samping seret, bukan menggantikannya: seret
						 * cepat untuk yang bertetikus, sedangkan menu ini satu-satunya
						 * jalan lewat papan tik - dan jalan yang pasti saat daftarnya
						 * panjang dan tujuannya di luar layar.
						 */}
						{(canMoveUp || canMoveDown) && <DropdownSeparator />}
						{canMoveUp && (
							<DropdownItem
								icon={<MoveUp className="h-4 w-4" />}
								onSelect={() => {
									close()
									onMoveUp()
								}}
							>
								Naikkan
							</DropdownItem>
						)}
						{canMoveDown && (
							<DropdownItem
								icon={<MoveDown className="h-4 w-4" />}
								onSelect={() => {
									close()
									onMoveDown()
								}}
							>
								Turunkan
							</DropdownItem>
						)}

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
 * Penanda kecil keadaan sinkronisasi sebuah tab.
 *
 * Tab yang belum terhubung tetap mendapat ikonnya sendiri: "belum tersimpan
 * di cloud" adalah informasi, bukan hiasan - naskah yang hilang karena
 * dikira sudah di cloud jauh lebih mahal daripada satu ikon tambahan.
 */
function SyncBadge({ status }: { status: SyncStatus }) {
	if (status === 'saving') {
		return (
			<span title="Menyimpan ke cloud…" className="flex shrink-0 items-center text-subtle">
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			</span>
		)
	}

	if (status === 'error') {
		return (
			<span title="Gagal menyimpan ke cloud" className="flex shrink-0 items-center text-red-400">
				<CloudAlert className="h-3.5 w-3.5" />
			</span>
		)
	}

	if (status === 'synced') {
		return (
			<span title="Tersimpan di cloud" className="flex shrink-0 items-center text-subtle">
				<Cloud className="h-3.5 w-3.5" />
			</span>
		)
	}

	if (status === 'dirty') {
		return (
			<span
				title="Ada perubahan yang belum tersimpan ke cloud"
				className="flex shrink-0 items-center text-subtle"
			>
				<CloudUpload className="h-3.5 w-3.5" />
			</span>
		)
	}

	return (
		<span title="Hanya tersimpan lokal di peramban ini" className="flex shrink-0 items-center text-faint">
			<CloudOff className="h-3.5 w-3.5" />
		</span>
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
	// Naskah tanpa heading tetap menjawab kliknya: tanpa baris ini daftar isi
	// yang dibuka terlihat seperti tombol yang rusak.
	if (items.length === 0) {
		return (
			<p className="mb-1 ml-4 mt-0.5 border-l border-line py-1 pl-2.5 pr-2 text-[13px] text-subtle">
				Belum ada heading
			</p>
		)
	}

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
