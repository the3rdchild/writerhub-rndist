'use client'

import type { Editor } from '@tiptap/react'
import { type ReactNode, useState } from 'react'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { download, safeFilename } from '@/features/document/download'
import { exportDocx } from '@/features/document/export-docx'
import { useDocumentImport } from '@/features/document/import-context'
import { promptForLink } from '@/features/editor/link'
import { convertMathInDocument, convertSelectionToMath } from '@/features/editor/math'
import { isInsideTable, tableRepeatsHeader } from '@/features/editor/table-header-repeat'
import {
	DEFAULT_MARGINS,
	pageGeometry,
	PAGE_SIZES,
	type PageSizeId,
	ZOOM_LEVELS,
} from '@/features/editor/page-geometry'
import { LINE_HEIGHTS, PARAGRAPH_STYLES } from '@/features/editor/text-styles'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { cn, countWords } from '@/lib/utils'

/**
 * Menu bar bergaya pengolah kata.
 *
 * Setiap butir benar-benar menjalankan sesuatu; tidak ada yang sekadar hiasan.
 * Butir yang belum punya perilaku lebih baik tidak dipasang sama sekali
 * daripada memberi kesan fitur yang sebenarnya belum ada.
 */
export function MenuBar() {
	const { editor } = useEditorInstance()
	const { state, dispatch } = useDocument()
	const { settings, update, toggleFocusMode, setSettingsOpen, setShortcutsOpen, setExportOpen } =
		useSettings()
	const { newSession, deleteSession, activeId } = useSessions()
	const { openImport } = useDocumentImport()
	const { setActivePanel } = usePanels()

	// Label pintasan datang dari registry, bukan diketik di sini - dulu teksnya
	// ditulis manual dan sempat menjanjikan tombol yang tidak pernah didaftarkan.
	const keys = useShortcutLabel()

	const downloadText = () => {
		download(
			new Blob([state.text], { type: 'text/plain;charset=utf-8' }),
			safeFilename(state.title, 'txt'),
		)
	}

	const [exporting, setExporting] = useState(false)

	const downloadDocx = async () => {
		if (!editor || exporting) return
		setExporting(true)
		try {
			const geometry = pageGeometry(settings.pageSize, settings.pageMargins)
			download(
				await exportDocx(editor, { title: state.title, geometry }),
				safeFilename(state.title, 'docx'),
			)
		} finally {
			setExporting(false)
		}
	}

	return (
		<nav className="flex items-center gap-0.5" aria-label="Menu dokumen">
			<Menu label="File">
				{({ close }) => (
					<>
						<Item onSelect={() => run(close, newSession)} shortcut={keys('doc.newTab')}>
							Tab baru
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Impor</DropdownLabel>
						<Item onSelect={() => run(close, () => openImport('docx'))}>
							Word (.docx) - dengan format
						</Item>
						<Item onSelect={() => run(close, () => openImport('text'))}>
							PDF atau teks - teks saja
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Ekspor</DropdownLabel>
						<Item onSelect={() => run(close, () => setExportOpen(true))}>PDF…</Item>
						<Item disabled={!editor || exporting} onSelect={() => run(close, downloadDocx)}>
							Word (.docx)
						</Item>
						<Item onSelect={() => run(close, downloadText)}>Teks polos (.txt)</Item>
						<DropdownSeparator />
						<Item onSelect={() => run(close, () => window.print())} shortcut={keys('doc.print')}>
							Cetak
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Ukuran kertas</DropdownLabel>
						{(Object.keys(PAGE_SIZES) as PageSizeId[]).map((size) => (
							<Item
								key={size}
								active={settings.pageSize === size}
								onSelect={() => run(close, () => update({ pageSize: size }))}
							>
								{PAGE_SIZES[size].label}
							</Item>
						))}
						<DropdownSeparator />
						<Item
							disabled={!activeId}
							shortcut={keys('doc.closeTab')}
							onSelect={() => run(close, () => activeId && deleteSession(activeId))}
						>
							Tutup tab ini
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Edit">
				{({ close }) => (
					<>
						<Item
							disabled={!editor?.can().undo()}
							shortcut={keys('doc.undo')}
							onSelect={() => run(close, () => editor?.chain().focus().undo().run())}
						>
							Urungkan
						</Item>
						<Item
							disabled={!editor?.can().redo()}
							shortcut={keys('doc.redo')}
							onSelect={() => run(close, () => editor?.chain().focus().redo().run())}
						>
							Ulangi
						</Item>
						<DropdownSeparator />
						<Item
							shortcut={keys('doc.selectAll')}
							onSelect={() => run(close, () => editor?.chain().focus().selectAll().run())}
						>
							Pilih semua
						</Item>
						<Item onSelect={() => run(close, () => navigator.clipboard.writeText(state.text))}>
							Salin seluruh teks
						</Item>
						<DropdownSeparator />
						<Item onSelect={() => run(close, () => dispatch({ type: 'clear' }))}>
							Kosongkan dokumen
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Tampilan">
				{({ close }) => (
					<>
						<Item active={settings.focusMode} onSelect={() => run(close, toggleFocusMode)}>
							Mode fokus
						</Item>
						<Item
							active={settings.showRuler}
							onSelect={() => run(close, () => update({ showRuler: !settings.showRuler }))}
						>
							Penggaris
						</Item>
						<Item
							active={settings.showDocumentTabs}
							onSelect={() =>
								run(close, () => update({ showDocumentTabs: !settings.showDocumentTabs }))
							}
						>
							Tab dokumen
						</Item>
						<Item
							active={settings.showPageNumbers}
							onSelect={() =>
								run(close, () => update({ showPageNumbers: !settings.showPageNumbers }))
							}
						>
							Nomor halaman
						</Item>
						<Item
							active={settings.showWordCount}
							onSelect={() => run(close, () => update({ showWordCount: !settings.showWordCount }))}
						>
							Jumlah kata
						</Item>
						<Item onSelect={() => run(close, () => update({ pageMargins: DEFAULT_MARGINS }))}>
							Setel ulang margin
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Perbesaran</DropdownLabel>
						{ZOOM_LEVELS.map((level) => (
							<Item
								key={level}
								active={settings.zoom === level}
								onSelect={() => run(close, () => update({ zoom: level }))}
							>
								{Math.round(level * 100)}%
							</Item>
						))}
					</>
				)}
			</Menu>

			<Menu label="Sisip">
				{({ close }) => (
					<>
						<Item
							onSelect={() =>
								run(close, () => {
									const url = window.prompt('URL gambar:')
									if (url) editor?.chain().focus().setImage({ src: url }).run()
								})
							}
						>
							Gambar…
						</Item>
						<Item
							onSelect={() =>
								run(close, () =>
									editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
								)
							}
						>
							Tabel 3×3
						</Item>
						<Item
							onSelect={() => run(close, () => editor?.chain().focus().setHorizontalRule().run())}
						>
							Garis horizontal
						</Item>
						<Item
							shortcut={keys('para.taskList')}
							onSelect={() => run(close, () => editor?.chain().focus().toggleTaskList().run())}
						>
							Daftar centang
						</Item>
						<Item
							shortcut={keys('doc.pageBreak')}
							onSelect={() => run(close, () => editor?.chain().focus().setPageBreak().run())}
						>
							Halaman baru
						</Item>
						<Item
							disabled={!isInsideTable(editor)}
							active={tableRepeatsHeader(editor)}
							onSelect={() =>
								run(close, () => editor?.chain().focus().toggleTableHeaderRepeat().run())
							}
						>
							Ulang header tabel
						</Item>
						<DropdownSeparator />
						<Item
							shortcut={keys('text.link')}
							onSelect={() => run(close, () => editor && promptForLink(editor))}
						>
							Tautan…
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Format">
				{({ close }) => (
					<>
						<Item
							shortcut={keys('text.bold')}
							onSelect={() => run(close, () => editor?.chain().focus().toggleBold().run())}
						>
							Tebal
						</Item>
						<Item
							shortcut={keys('text.italic')}
							onSelect={() => run(close, () => editor?.chain().focus().toggleItalic().run())}
						>
							Miring
						</Item>
						<Item
							shortcut={keys('text.underline')}
							onSelect={() => run(close, () => editor?.chain().focus().toggleUnderline().run())}
						>
							Garis bawah
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Rumus</DropdownLabel>
						<Item
							disabled={!editor || editor.state.selection.empty}
							onSelect={() => run(close, () => editor && convertSelectionToMath(editor, false))}
						>
							Jadikan rumus
						</Item>
						<Item
							disabled={!editor || editor.state.selection.empty}
							onSelect={() => run(close, () => editor && convertSelectionToMath(editor, true))}
						>
							Jadikan rumus blok
						</Item>
						<Item
							disabled={!editor}
							onSelect={() => run(close, () => editor && convertMathInDocument(editor))}
						>
							Konversi semua $rumus$ di dokumen
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Gaya paragraf</DropdownLabel>
						{PARAGRAPH_STYLES.map((style) => (
							<Item
								key={style.id}
								active={editor ? style.isActive(editor) : false}
								onSelect={() => run(close, () => editor && style.apply(editor))}
							>
								{style.label}
							</Item>
						))}
						<DropdownSeparator />
						<DropdownLabel>Spasi baris</DropdownLabel>
						{LINE_HEIGHTS.map((option) => (
							<Item
								key={option.value}
								onSelect={() =>
									run(close, () => editor?.chain().focus().setLineHeight(option.value).run())
								}
							>
								{option.label}
							</Item>
						))}
						<DropdownSeparator />
						<Item
							onSelect={() =>
								run(close, () => editor?.chain().focus().unsetAllMarks().clearNodes().run())
							}
						>
							Hapus format
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Tools">
				{({ close }) => (
					<>
						<Item onSelect={() => run(close, () => setActivePanel('proofreader'))}>Proofreader</Item>
						<Item onSelect={() => run(close, () => setActivePanel('ai_detector'))}>AI Detector</Item>
						<Item onSelect={() => run(close, () => setActivePanel('ai_rewriter'))}>AI Rewriter</Item>
						<Item onSelect={() => run(close, () => setActivePanel('humanizer'))}>Humanizer</Item>
						<Item onSelect={() => run(close, () => setActivePanel('plagiarism'))}>
							Plagiarism Checker
						</Item>
						<DropdownSeparator />
						<Item disabled>
							{countWords(state.text)} words · {state.text.length} characters
						</Item>
						<DropdownSeparator />
						<Item onSelect={() => run(close, () => setSettingsOpen(true))}>Settings…</Item>
					</>
				)}
			</Menu>

			<Menu label="Bantuan">
				{({ close }) => (
					<>
						<Item
							shortcut={keys('view.shortcuts')}
							onSelect={() => run(close, () => setShortcutsOpen(true))}
						>
							Pintasan papan tik…
						</Item>
						<DropdownSeparator />
						<Item onSelect={() => run(close, () => setSettingsOpen(true))}>Tentang WritingHub</Item>
					</>
				)}
			</Menu>
		</nav>
	)
}

/** Jalankan aksi lalu tutup menu - pola yang berulang di hampir semua butir. */
function run(close: () => void, action: () => void) {
	action()
	close()
}

function Menu({
	label,
	children,
}: {
	label: string
	children: (props: { close: () => void }) => ReactNode
}) {
	return (
		<Dropdown
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'rounded-md px-2.5 py-1 text-sm transition-colors',
						open
							? 'bg-[var(--overlay-active)] text-foreground'
							: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
					)}
				>
					{label}
				</button>
			)}
		>
			{children}
		</Dropdown>
	)
}

const Item = DropdownItem
