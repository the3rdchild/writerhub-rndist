'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { editorPlainText } from '@/features/editor/text-content'
import { useDocument } from './document-context'
import { importDocx, isDocx } from './import-docx'

/**
 * Satu jalur masuk untuk berkas, dipakai bersama menu File dan tombol di bilah
 * status.
 *
 * Sebelumnya logika ini tinggal di dalam DocumentEditor bersama input berkasnya,
 * jadi satu-satunya cara memicunya adalah ikon tanpa label di pojok bawah -
 * fungsinya ada, tapi praktis tidak ditemukan. Yang memiliki input berkas
 * sekarang context ini, sehingga pemicunya boleh ada di mana saja.
 */

/** Jenis berkas yang diminta; menentukan filter pada dialog pemilih. */
export type ImportKind = 'any' | 'docx' | 'text'

const ACCEPT: Record<ImportKind, string> = {
	any: '.txt,.pdf,.docx',
	docx: '.docx',
	text: '.txt,.pdf',
}

interface ImportContextValue {
	/** Buka dialog pemilih berkas. */
	openImport: (kind?: ImportKind) => void
	importing: boolean
	/** Hal yang tidak punya padanan di editor ini; ditunjukkan, bukan disembunyikan. */
	warnings: string[]
	dismissWarnings: () => void
}

const ImportContext = createContext<ImportContextValue | null>(null)

/** TXT dibaca di browser supaya isinya langsung terlihat. */
function isPlainTextFile(file: File): boolean {
	return file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
}

export function DocumentImportProvider({ children }: { children: ReactNode }) {
	const { dispatch } = useDocument()
	const { editor } = useEditorInstance()

	const inputRef = useRef<HTMLInputElement>(null)
	const [importing, setImporting] = useState(false)
	const [warnings, setWarnings] = useState<string[]>([])

	const openImport = useCallback((kind: ImportKind = 'any') => {
		const input = inputRef.current
		if (!input) return
		input.accept = ACCEPT[kind]
		input.click()
	}, [])

	/**
	 * DOCX dibaca lengkap dengan formatnya, langsung di browser.
	 *
	 * Jalur worker (`setFile`) tetap dipakai untuk PDF: di sana yang bisa diambil
	 * memang hanya teks. PDF tidak menyimpan struktur - ia menyimpan glyph
	 * berposisi - jadi heading dan tabel hanya bisa ditebak, bukan dibaca.
	 */
	const loadDocx = useCallback(
		async (file: File) => {
			if (!editor) return
			setImporting(true)
			setWarnings([])

			try {
				const result = await importDocx(file)
				editor.commands.setContent(result.content, { emitUpdate: false })
				dispatch({
					type: 'load',
					document: {
						title: file.name.replace(/\.docx$/i, ''),
						text: editorPlainText(editor),
					},
				})
				setWarnings(result.warnings.map((warning) => warning.message))
			} catch (cause) {
				setWarnings([cause instanceof Error ? cause.message : 'Gagal membaca berkas DOCX'])
			} finally {
				setImporting(false)
			}
		},
		[editor, dispatch],
	)

	const handleFile = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0]
			event.target.value = ''
			if (!file) return

			if (isDocx(file)) {
				void loadDocx(file)
				return
			}

			if (!isPlainTextFile(file)) {
				dispatch({ type: 'setFile', file })
				return
			}

			const reader = new FileReader()
			reader.onload = () => {
				const text = reader.result
				if (typeof text === 'string') dispatch({ type: 'setText', text })
			}
			reader.readAsText(file)
		},
		[loadDocx, dispatch],
	)

	const value = useMemo<ImportContextValue>(
		() => ({ openImport, importing, warnings, dismissWarnings: () => setWarnings([]) }),
		[openImport, importing, warnings],
	)

	return (
		<ImportContext.Provider value={value}>
			{children}
			<input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
		</ImportContext.Provider>
	)
}

export function useDocumentImport(): ImportContextValue {
	const context = useContext(ImportContext)
	if (!context) throw new Error('useDocumentImport harus dipakai di dalam <DocumentImportProvider>')
	return context
}
