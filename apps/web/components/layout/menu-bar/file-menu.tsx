'use client'
import { Boxes, Download, Files, FileText, Printer, RotateCcw, Upload } from 'lucide-react'
import { useState } from 'react'
import { refreshHtmlBlocks } from '@/components/editor/html-block-view'
import { refreshTocBlocks } from '@/components/editor/toc-block-view'
import { DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { useDocument } from '@/features/document/document-context'
import { download, safeFilename } from '@/features/document/download'
import { exportDocx } from '@/features/document/export-docx'
import { useDocumentImport } from '@/features/document/import-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import { pageGeometry } from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { Item, Menu, run } from './menu-shell'

export function FileMenu() {
	const { editor } = useEditorInstance()
	const { state } = useDocument()
	const { setExportOpen, setDocxExportOpen, setPageSetupOpen } = useSettings()
	const { newSession, deleteSession, activeId, sessions } = useSessions()
	const { setup: activeSetup } = usePageSetup()
	const { furniture } = usePageFurniture()
	const { typography } = useTypography()
	const { openImport } = useDocumentImport()
	const keys = useShortcutLabel()
	const [exporting, setExporting] = useState(false)

	const downloadText = () => {
		download(new Blob([state.text], { type: 'text/plain;charset=utf-8' }), safeFilename(state.title, 'txt'))
	}

	const downloadDocx = async () => {
		if (!editor || exporting) return
		refreshTocBlocks(editor.view.dom)
		await refreshHtmlBlocks(editor.view.dom)
		if (sessions.length > 1) {
			setDocxExportOpen(true)
			return
		}
		setExporting(true)
		try {
			const geometry = pageGeometry(activeSetup)
			download(
				await exportDocx(editor.state.doc, {
					title: state.title,
					geometry,
					setup: activeSetup,
					furniture,
					typography,
				}),
				safeFilename(state.title, 'docx'),
			)
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
						Tab baru
					</Item>
					<DropdownSeparator />
					{/* Impor & ekspor dikelompokkan sebagai submenu supaya daftar tetap
			    ringkas; tiap submenu hanya berisi format yang relevan. */}
					<Submenu label="Impor" icon={<Upload className="h-4 w-4" />}>
						{() => (
							<>
								<Item
									icon={<FileText className="h-4 w-4" />}
									onSelect={() => run(close, () => openImport('docx'))}
								>
									Word (.docx) - dengan format
								</Item>
								<Item
									icon={<FileText className="h-4 w-4" />}
									onSelect={() => run(close, () => openImport('text'))}
								>
									PDF atau teks - teks saja
								</Item>
							</>
						)}
					</Submenu>
					<Submenu label="Ekspor" icon={<Download className="h-4 w-4" />}>
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
								<Item icon={<FileText className="h-4 w-4" />} onSelect={() => run(close, downloadText)}>
									Teks polos (.txt)
								</Item>
							</>
						)}
					</Submenu>
					<Item
						icon={<Printer className="h-4 w-4" />}
						onSelect={() => run(close, () => window.print())}
						shortcut={keys('doc.print')}
					>
						Cetak
					</Item>
					<DropdownSeparator />
					<Item
						icon={<Boxes className="h-4 w-4" />}
						disabled={!activeId}
						onSelect={() => run(close, () => setPageSetupOpen(true))}
					>
						Penyiapan halaman…
					</Item>
					<DropdownSeparator />
					<Item
						icon={<RotateCcw className="h-4 w-4" />}
						disabled={!activeId}
						shortcut={keys('doc.closeTab')}
						onSelect={() => run(close, () => activeId && deleteSession(activeId))}
					>
						Tutup tab ini
					</Item>
				</>
			)}
		</Menu>
	)
}
