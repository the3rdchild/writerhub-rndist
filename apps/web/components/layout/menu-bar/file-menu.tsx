'use client'
import { Boxes, Download, Files, FileText, Info, Printer, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { useBrief } from '@/features/brief/brief-context'
import { useDocument } from '@/features/document/document-context'
import { download, safeFilename } from '@/features/document/download'
import { exportDocx } from '@/features/document/export-docx'
import { reportDocxExportError } from '@/features/document/export-docx-dialog'
import { useDocumentImport } from '@/features/document/import-context'
import { plainTextOfTabs } from '@/features/document/plain-text-export'
import { prepareForExport } from '@/features/document/prepare-export'
import { useEditorInstance } from '@/features/editor/editor-context'
import { readFurnitureContentJson } from '@/features/editor/page-furniture/page-furniture-ydoc'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import { pageGeometry } from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { buildSchema, fragmentToJSON } from '@/features/sync/serialize'
import { Item, Menu, run } from './menu-shell'

export function FileMenu() {
	const { editor } = useEditorInstance()
	const { state } = useDocument()
	const { setExportOpen, setDocxExportOpen, setPageSetupOpen, setPendingTabDelete, settings } = useSettings()
	const { openPanel: openMetadata } = useBrief()
	const { newSession, activeId, sessions, doc } = useSessions()
	const { setup: activeSetup } = usePageSetup()
	const { furniture } = usePageFurniture()
	const { typography } = useTypography()
	const { openImport } = useDocumentImport()
	const keys = useShortcutLabel()
	const [exporting, setExporting] = useState(false)

	/* Teks polos tab ini atau semua tab; dulu hanya tab aktif, tanpa pilihan (SHL-19). */
	const downloadText = (allTabs: boolean) => {
		const chosen = allTabs ? sessions : sessions.filter((tab) => tab.id === activeId)
		const schema = buildSchema()
		const text = plainTextOfTabs(
			chosen.map((tab) => ({
				title: sessionLabel(tab),
				doc:
					tab.id === activeId && editor ? editor.state.doc : schema.nodeFromJSON(fragmentToJSON(doc, tab.id)),
			})),
		)
		download(new Blob([text], { type: 'text/plain;charset=utf-8' }), safeFilename(state.title, 'txt'))
	}

	const downloadDocx = async () => {
		if (!editor || exporting) return
		setExporting(true)
		try {
			await prepareForExport(editor)
			if (sessions.length > 1) {
				setDocxExportOpen(true)
				return
			}
			const geometry = pageGeometry(activeSetup)
			download(
				await exportDocx(editor.state.doc, {
					title: state.title,
					geometry,
					setup: activeSetup,
					furniture,
					furnitureContent: activeId ? readFurnitureContentJson(doc, activeId) : null,
					typography,
					showPageNumbers: settings.showPageNumbers,
				}),
				safeFilename(state.title, 'docx'),
			)
		} catch (error) {
			// Ekspor yang gagal dulu diam saja: tidak ada berkas, tidak ada pesan.
			reportDocxExportError(error)
		} finally {
			setExporting(false)
		}
	}

	return (
		<Menu label="File" icon={<FileText className="h-4 w-4" />}>
			{({ close }) => (
				<>
					<Item
						icon={<Files className="h-4 w-4" />}
						onSelect={() => run(close, newSession)}
						shortcut={keys('doc.newTab')}
					>
						New tab
					</Item>
					<DropdownSeparator />
					{/* Impor & ekspor dikelompokkan sebagai submenu supaya daftar tetap
			    ringkas; tiap submenu hanya berisi format yang relevan. */}
					<Submenu label="Import" icon={<Upload className="h-4 w-4" />}>
						{() => (
							<>
								<Item
									icon={<FileText className="h-4 w-4" />}
									onSelect={() => run(close, () => openImport('docx'))}
								>
									Word (.docx) - with formatting
								</Item>
								<Item
									icon={<FileText className="h-4 w-4" />}
									onSelect={() => run(close, () => openImport('text'))}
								>
									PDF or text - text only
								</Item>
							</>
						)}
					</Submenu>
					<Submenu label="Export" icon={<Download className="h-4 w-4" />}>
						{() => (
							<>
								<Item
									icon={<FileText className="h-4 w-4" />}
									onSelect={() => run(close, () => setExportOpen(true))}
								>
									PDF…
								</Item>
								<Item
									icon={<FileText className="h-4 w-4" />}
									disabled={!editor || exporting}
									onSelect={() => run(close, downloadDocx)}
								>
									Word (.docx)
								</Item>
								<Item
									icon={<FileText className="h-4 w-4" />}
									onSelect={() => run(close, () => downloadText(false))}
								>
									Plain text (.txt)
								</Item>
								{sessions.length > 1 && (
									<Item
										icon={<FileText className="h-4 w-4" />}
										onSelect={() => run(close, () => downloadText(true))}
									>
										Plain text, all tabs (.txt)
									</Item>
								)}
							</>
						)}
					</Submenu>
					<Item
						icon={<Printer className="h-4 w-4" />}
						onSelect={() =>
							run(close, async () => {
								await prepareForExport(editor)
								window.print()
							})
						}
						shortcut={keys('doc.print')}
					>
						Print
					</Item>
					<DropdownSeparator />
					<Item
						icon={<Boxes className="h-4 w-4" />}
						disabled={!activeId}
						onSelect={() => run(close, () => setPageSetupOpen(true))}
					>
						Page setup…
					</Item>
					{/* Metadata milik dokumen, bukan halaman - tapi keduanya sama-sama
					    "tentang berkas ini", dan menu File tempat orang mencarinya.
					    Yang dibuka panel di samping AI Chat, tempat AI membacanya. */}
					<Item
						icon={<Info className="h-4 w-4" />}
						disabled={!activeId}
						onSelect={() => run(close, () => openMetadata())}
					>
						Document metadata…
					</Item>
					<DropdownSeparator />
					{/* Hanya meminta konfirmasi (DeleteTabDialog). Tab terakhir tidak bisa
					    dihapus dari sini - sama seperti menu ⋮ tab dan Ctrl+Alt+W. */}
					<Item
						icon={<Trash2 className="h-4 w-4" />}
						disabled={!activeId || sessions.length < 2}
						shortcut={keys('doc.closeTab')}
						onSelect={() => run(close, () => activeId && setPendingTabDelete(activeId))}
					>
						Delete this tab…
					</Item>
				</>
			)}
		</Menu>
	)
}
