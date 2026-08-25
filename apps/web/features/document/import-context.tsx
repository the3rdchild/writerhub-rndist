'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import {
	DEFAULT_MARGINS,
	DEFAULT_PAGE_SETUP,
	type PageSetup,
} from '@/features/editor/page-geometry'
import { MAX_DOCUMENTS, MAX_SESSIONS, useSessions } from '@/features/sessions/session-context'
import { createDocument, createTab, LOCAL_ORIGIN, readDocs, readTabs, setPageSetupForTab } from '@/features/sessions/ydoc'
import { jsonToFragment } from '@/features/sync/serialize'
import { useDocument } from './document-context'
import { type DocxImport, importDocx, isDocx } from './import-docx'
export type ImportKind = 'any' | 'docx' | 'text'

const ACCEPT: Record<ImportKind, string> = {
	any: '.txt,.pdf,.docx',
	docx: '.docx',
	text: '.txt,.pdf',
}

interface ImportContextValue {
	openImport: (kind?: ImportKind) => void
	importing: boolean
	warnings: string[]
	dismissWarnings: () => void
}

const ImportContext = createContext<ImportContextValue | null>(null)
function isPlainTextFile(file: File): boolean {
	return file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
}
function baseName(file: File): string {
	return file.name.replace(/\.[^.]+$/, '')
}
function textToDocContent(text: string): JSONContent {
	const paragraphs: JSONContent[] = text
		.split('\n')
		.map((line) =>
			line.trim().length > 0
				? { type: 'paragraph', content: [{ type: 'text', text: line }] }
				: { type: 'paragraph' },
		)
	return {
		type: 'doc',
		content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }],
	}
}
function resolveImportedSetup(patch: NonNullable<DocxImport['pageSetup']>): PageSetup {
	return {
		...DEFAULT_PAGE_SETUP,
		...patch,
		margins: { ...DEFAULT_MARGINS, ...patch.margins },
	}
}

export function DocumentImportProvider({ children }: { children: ReactNode }) {
	const { dispatch } = useDocument()
	const { doc, activeDocId, selectSession } = useSessions()

	const inputRef = useRef<HTMLInputElement>(null)
	const [importing, setImporting] = useState(false)
	const [warnings, setWarnings] = useState<string[]>([])

	const openImport = useCallback((kind: ImportKind = 'any') => {
		const input = inputRef.current
		if (!input) return
		input.accept = ACCEPT[kind]
		input.click()
	}, [])
	const importToNewTab = useCallback(
		(title: string, content: JSONContent, pageSetup?: DocxImport['pageSetup']) => {
			if (!activeDocId) return
			const tabId = createTab(doc, activeDocId, title)
			doc.transact(() => {
				jsonToFragment(doc, tabId, content)
				if (pageSetup) setPageSetupForTab(doc, tabId, resolveImportedSetup(pageSetup))
			}, LOCAL_ORIGIN)
			selectSession(tabId)
		},
		[doc, activeDocId, selectSession],
	)
	const loadDocx = useCallback(
		async (file: File) => {
			setImporting(true)
			setWarnings([])

			try {
				const result = await importDocx(file)
				importToNewTab(file.name.replace(/\.docx$/i, ''), result.content, result.pageSetup)
				setWarnings(result.warnings.map((warning) => warning.message))
			} catch (cause) {
				setWarnings([cause instanceof Error ? cause.message : 'Gagal membaca berkas DOCX'])
			} finally {
				setImporting(false)
			}
		},
		[importToNewTab],
	)
	const loadText = useCallback(
		(file: File) => {
			const reader = new FileReader()
			reader.onload = () => {
				if (typeof reader.result !== 'string') return
				importToNewTab(file.name.replace(/\.txt$/i, ''), textToDocContent(reader.result))
			}
			reader.readAsText(file)
		},
		[importToNewTab],
	)
	const importMany = useCallback(
		async (files: File[]) => {
			setImporting(true)
			setWarnings([])

			const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
			const importable = sorted.filter((file) => isDocx(file) || isPlainTextFile(file))
			const warn: string[] = []
			if (importable.length < sorted.length) {
				warn.push(
					'Berkas PDF dilewati pada impor banyak berkas - impor PDF satu per satu supaya hasilnya masuk ke tab yang benar.',
				)
			}
			if (importable.length === 0) {
				setWarnings(warn.length > 0 ? warn : ['Tidak ada berkas yang bisa diimpor.'])
				setImporting(false)
				return
			}
			const limited = importable.slice(0, MAX_SESSIONS)
			if (importable.length > MAX_SESSIONS) {
				warn.push(`Hanya ${MAX_SESSIONS} berkas pertama yang diimpor - batas tab per dokumen.`)
			}
			if (readDocs(doc).length >= MAX_DOCUMENTS) {
				warn.push('Batas jumlah dokumen tercapai; impor dibatalkan.')
				setWarnings(warn)
				setImporting(false)
				return
			}
			const parsed: Array<{ title: string; content: JSONContent; pageSetup?: DocxImport['pageSetup'] }> = []
			for (const file of limited) {
				try {
					if (isDocx(file)) {
						const result = await importDocx(file)
						warn.push(...result.warnings.map((warning) => warning.message))
						parsed.push({ title: baseName(file), content: result.content, pageSetup: result.pageSetup })
					} else {
						parsed.push({ title: baseName(file), content: textToDocContent(await file.text()) })
					}
				} catch (cause) {
					warn.push(
						`${file.name}: ${cause instanceof Error ? cause.message : 'gagal membaca berkas'}`,
					)
				}
			}

			if (parsed.length === 0) {
				setWarnings(warn)
				setImporting(false)
				return
			}
			let firstTabId = ''
			doc.transact(() => {
				const docId = createDocument(doc, parsed[0].title)
				firstTabId = readTabs(doc, docId)[0]?.id ?? ''
				if (!firstTabId) return
				jsonToFragment(doc, firstTabId, parsed[0].content)
				if (parsed[0].pageSetup) setPageSetupForTab(doc, firstTabId, resolveImportedSetup(parsed[0].pageSetup))
				for (const item of parsed.slice(1)) {
					const tabId = createTab(doc, docId, item.title)
					jsonToFragment(doc, tabId, item.content)
					if (item.pageSetup) setPageSetupForTab(doc, tabId, resolveImportedSetup(item.pageSetup))
				}
			}, LOCAL_ORIGIN)

			if (firstTabId) selectSession(firstTabId)
			setWarnings(warn)
			setImporting(false)
		},
		[doc, selectSession],
	)

	const handleFile = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(event.target.files ?? [])
			event.target.value = ''
			if (files.length === 0) return

			if (files.length > 1) {
				void importMany(files)
				return
			}

			const file = files[0]
			if (isDocx(file)) {
				void loadDocx(file)
				return
			}

			if (!isPlainTextFile(file)) {
				if (!activeDocId) return
				const tabId = createTab(doc, activeDocId, baseName(file))
				selectSession(tabId)
				dispatch({ type: 'setFile', file })
				return
			}

			loadText(file)
		},
		[importMany, loadDocx, loadText, doc, activeDocId, selectSession, dispatch],
	)

	const value = useMemo<ImportContextValue>(
		() => ({ openImport, importing, warnings, dismissWarnings: () => setWarnings([]) }),
		[openImport, importing, warnings],
	)

	return (
		<ImportContext.Provider value={value}>
			{children}
			<input ref={inputRef} type="file" multiple className="hidden" onChange={handleFile} />
		</ImportContext.Provider>
	)
}

export function useDocumentImport(): ImportContextValue {
	const context = useContext(ImportContext)
	if (!context) throw new Error('useDocumentImport harus dipakai di dalam <DocumentImportProvider>')
	return context
}
