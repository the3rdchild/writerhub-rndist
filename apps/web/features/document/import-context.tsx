'use client'

import type { JSONContent } from '@tiptap/core'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { FurnitureContent } from '@/features/document/docx/header-footer'
import { sanitizeFurnitureBlocks } from '@/features/editor/page-furniture/furniture-schema'
import type { PageFurniture } from '@/features/editor/page-furniture/model'
import {
	setFurnitureFragment,
	setPageFurnitureForTab,
} from '@/features/editor/page-furniture/page-furniture-ydoc'
import { DEFAULT_MARGINS, DEFAULT_PAGE_SETUP, type PageSetup } from '@/features/editor/page-geometry'
import { MAX_DOCUMENTS, MAX_SESSIONS, useSessions } from '@/features/sessions/session-context'
import {
	createDocument,
	createTab,
	LOCAL_ORIGIN,
	readDocs,
	readTabs,
	setPageSetupForTab,
	updateTab,
} from '@/features/sessions/ydoc'
import { jsonToFragment } from '@/features/sync/serialize'
import { type DocxImport, importDocx, isDocx } from './import-docx'
import { importPdfText, isPdf } from './import-pdf'
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
		(
			title: string,
			content: JSONContent,
			pageSetup?: DocxImport['pageSetup'],
			furniture?: PageFurniture | null,
			comments?: DocxImport['comments'],
			furnitureContent?: FurnitureContent | null,
		) => {
			if (!activeDocId) return
			const tabId = createTab(doc, activeDocId, title)
			const furnitureSkipped: string[] = []
			doc.transact(() => {
				jsonToFragment(doc, tabId, content)
				if (pageSetup) setPageSetupForTab(doc, tabId, resolveImportedSetup(pageSetup))
				if (furniture) setPageFurnitureForTab(doc, tabId, furniture)
				/* Isi kaya header/footer jadi fragmen ydoc; migrasi ensureFurnitureFragment
				 * nanti memakai baris lama di atas bila fragmen tidak ada. */
				for (const [slot, variants] of Object.entries(furnitureContent ?? {})) {
					for (const [variant, blocks] of Object.entries(variants ?? {})) {
						if (!Array.isArray(blocks) || blocks.length === 0) continue
						/*
						 * Header/footer tidak boleh menjatuhkan seluruh impor.
						 *
						 * Isinya disaring dulu terhadap skema perabot yang ringan, dan
						 * kalaupun masih ada yang ditolak, kegagalannya ditahan di sini:
						 * sebelumnya satu mark asing membatalkan transaksi impor, dan
						 * naskah utuh berakhir sebagai tab kosong.
						 */
						try {
							setFurnitureFragment(
								doc,
								tabId,
								{ slot: slot as 'header' | 'footer', variant: variant as 'default' | 'first' | 'even' },
								{ type: 'doc', content: sanitizeFurnitureBlocks(blocks) },
							)
						} catch {
							furnitureSkipped.push(`${slot}/${variant}`)
						}
					}
				}
				if (comments && comments.length > 0) updateTab(doc, tabId, { comments })
			}, LOCAL_ORIGIN)
			if (furnitureSkipped.length > 0) {
				setWarnings((current) => [
					...current,
					`Header/footer content wasn't imported for: ${furnitureSkipped.join(', ')}.`,
				])
			}
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
				importToNewTab(
					file.name.replace(/\.docx$/i, ''),
					result.content,
					result.pageSetup,
					result.furniture,
					result.comments,
					result.furnitureContent,
				)
				setWarnings(result.warnings.map((warning) => warning.message))
			} catch (cause) {
				setWarnings([cause instanceof Error ? cause.message : "Couldn't read the DOCX file"])
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
	const loadPdf = useCallback(
		async (file: File) => {
			setImporting(true)
			setWarnings([])
			try {
				const result = await importPdfText(file)
				if (result.paragraphs === 0) {
					setWarnings([`No text found in ${file.name}. It may be a scanned image without a text layer.`])
					return
				}
				importToNewTab(baseName(file), result.content)
			} catch (cause) {
				setWarnings([`${file.name}: ${cause instanceof Error ? cause.message : 'could not read the PDF'}`])
			} finally {
				setImporting(false)
			}
		},
		[importToNewTab],
	)
	const importMany = useCallback(
		async (files: File[]) => {
			setImporting(true)
			setWarnings([])

			const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
			const importable = sorted.filter((file) => isDocx(file) || isPdf(file) || isPlainTextFile(file))
			const warn: string[] = []
			const skipped = sorted.filter((file) => !importable.includes(file))
			if (skipped.length > 0) {
				warn.push(
					`Skipped unsupported files: ${skipped.map((file) => file.name).join(', ')}. Import supports Word (.docx), PDF, and text (.txt) files.`,
				)
			}
			if (importable.length === 0) {
				setWarnings(warn.length > 0 ? warn : ['There are no files that can be imported.'])
				setImporting(false)
				return
			}
			const limited = importable.slice(0, MAX_SESSIONS)
			if (importable.length > MAX_SESSIONS) {
				warn.push(`Only the first ${MAX_SESSIONS} files were imported - the tab limit per document.`)
			}
			if (readDocs(doc).length >= MAX_DOCUMENTS) {
				warn.push('The document limit was reached; the import was cancelled.')
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
					} else if (isPdf(file)) {
						const result = await importPdfText(file)
						if (result.paragraphs === 0) warn.push(`No text found in ${file.name} (scanned image?).`)
						else parsed.push({ title: baseName(file), content: result.content })
					} else {
						parsed.push({ title: baseName(file), content: textToDocContent(await file.text()) })
					}
				} catch (cause) {
					warn.push(`${file.name}: ${cause instanceof Error ? cause.message : "couldn't read the file"}`)
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
				if (parsed[0].pageSetup)
					setPageSetupForTab(doc, firstTabId, resolveImportedSetup(parsed[0].pageSetup))
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

			if (isPdf(file)) {
				void loadPdf(file)
				return
			}
			/* Jenis lain dulu membuat tab kosong tanpa pesan (SHL-4: PNG, PDF). */
			if (!isPlainTextFile(file)) {
				setWarnings([
					`${file.name} can't be imported. Import supports Word (.docx), PDF, and text (.txt) files.`,
				])
				return
			}

			loadText(file)
		},
		[importMany, loadDocx, loadPdf, loadText],
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
