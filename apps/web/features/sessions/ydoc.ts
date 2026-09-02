'use client'

import type { DocumentTypography } from '@writer-hub/shared'
import * as Y from 'yjs'
import type { PageSetup } from '@/features/editor/page-geometry'
import { DEFAULT_PAGE_SETUP } from '@/features/editor/page-geometry'
import { DEFAULT_TYPOGRAPHY, normalizeTypography } from '@/features/editor/typography'
import type { CommentThread } from './types'

const TABS = 'tabs'
const DOCS = 'docs'
const ORDER = 'order'
const META = 'meta'
const TAB_ORDER = 'tabOrder'
export const TYPOGRAPHY = 'typography'
export const LOCAL_ORIGIN = 'local'

export interface TabMeta {
	id: string
	title: string
	emoji: string | null
	language: string | null
	comments: CommentThread[]
	updatedAt: number
	pageSetup: PageSetup | null
	typography: DocumentTypography | null
}

export interface DocMeta {
	id: string
	title: string
	tabOrder: string[]
	updatedAt: number
	titleUpdatedAt: number
	pageSetup: PageSetup | null
	typography: DocumentTypography | null
}

export function createTabId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function createDocId(): string {
	return createTabId()
}

interface TabsRoot {
	root: Y.Map<unknown>
	meta: Y.Map<Y.Map<unknown>>
}

interface DocsRoot {
	root: Y.Map<unknown>
	order: Y.Array<string>
	meta: Y.Map<Y.Map<unknown>>
}

export function tabsRoot(doc: Y.Doc): TabsRoot {
	const root = doc.getMap<unknown>(TABS)

	let meta = root.get(META) as Y.Map<Y.Map<unknown>> | undefined

	if (!meta) {
		doc.transact(() => {
			if (!root.has(META)) root.set(META, new Y.Map<Y.Map<unknown>>())
		}, LOCAL_ORIGIN)
		meta = root.get(META) as Y.Map<Y.Map<unknown>>
	}

	return { root, meta }
}

export function docsRoot(doc: Y.Doc): DocsRoot {
	const root = doc.getMap<unknown>(DOCS)

	let order = root.get(ORDER) as Y.Array<string> | undefined
	let meta = root.get(META) as Y.Map<Y.Map<unknown>> | undefined

	if (!order || !meta) {
		doc.transact(() => {
			if (!root.has(ORDER)) root.set(ORDER, new Y.Array<string>())
			if (!root.has(META)) root.set(META, new Y.Map<Y.Map<unknown>>())
		}, LOCAL_ORIGIN)
		order = root.get(ORDER) as Y.Array<string>
		meta = root.get(META) as Y.Map<Y.Map<unknown>>
	}

	return { root, order, meta }
}

export function legacyTabOrder(doc: Y.Doc): Y.Array<string> | undefined {
	return doc.getMap<unknown>(TABS).get(ORDER) as Y.Array<string> | undefined
}

export function clearLegacyTabOrder(doc: Y.Doc): void {
	doc.transact(() => {
		doc.getMap<unknown>(TABS).delete(ORDER)
	}, LOCAL_ORIGIN)
}

export function tabFragment(doc: Y.Doc, id: string): Y.XmlFragment {
	return doc.getXmlFragment(id)
}

function readMeta(meta: Y.Map<Y.Map<unknown>>, id: string): TabMeta {
	const entry = meta.get(id)
	return {
		id,
		title: (entry?.get('title') as string) ?? 'Untitled document',
		emoji: (entry?.get('emoji') as string | null) ?? null,
		language: (entry?.get('language') as string | null) ?? null,
		comments: (entry?.get('comments') as CommentThread[]) ?? [],
		updatedAt: (entry?.get('updatedAt') as number) ?? 0,
		pageSetup: readPageSetup(entry),
		typography: normalizeTypography(entry?.get(TYPOGRAPHY)),
	}
}

function readDocMeta(meta: Y.Map<Y.Map<unknown>>, id: string): DocMeta {
	const entry = meta.get(id)
	const tabOrder = entry?.get(TAB_ORDER) as Y.Array<string> | undefined
	return {
		id,
		title: (entry?.get('title') as string) ?? 'Untitled document',
		tabOrder: tabOrder?.toArray() ?? [],
		updatedAt: (entry?.get('updatedAt') as number) ?? 0,
		titleUpdatedAt: (entry?.get('titleUpdatedAt') as number) ?? 0,
		pageSetup: readPageSetup(entry),
		typography: normalizeTypography(entry?.get(TYPOGRAPHY)),
	}
}

function readPageSetup(entry: Y.Map<unknown> | undefined): PageSetup | null {
	if (!entry) return null
	const raw = entry.get('pageSetup')
	if (!raw || typeof raw !== 'object') return null
	const value = raw as Partial<PageSetup>
	return {
		size: value.size ?? DEFAULT_PAGE_SETUP.size,
		orientation: value.orientation ?? DEFAULT_PAGE_SETUP.orientation,
		margins: value.margins ?? DEFAULT_PAGE_SETUP.margins,
		pageColor: value.pageColor ?? null,
		pageless: value.pageless ?? false,
		...(value.size === 'custom' ? { customWidth: value.customWidth, customHeight: value.customHeight } : {}),
	}
}

export function resolvePageSetup(
	doc: Y.Doc,
	tabId: string,
	fallback: PageSetup = DEFAULT_PAGE_SETUP,
): PageSetup {
	const tab = readMeta(tabsRoot(doc).meta, tabId).pageSetup
	if (tab) return tab

	const docId = findTabDoc(doc, tabId)
	const documentSetup = docId ? readDocMeta(docsRoot(doc).meta, docId).pageSetup : null
	return documentSetup ?? fallback
}

export function setPageSetupForDoc(doc: Y.Doc, docId: string, setup: PageSetup): void {
	const { meta: docsMeta } = docsRoot(doc)
	const { meta: tabsMeta } = tabsRoot(doc)
	const tabIds = readDocMeta(docsMeta, docId).tabOrder

	doc.transact(() => {
		docsMeta.get(docId)?.set('pageSetup', setup)
		for (const tabId of tabIds) {
			const entry = tabsMeta.get(tabId)
			if (entry?.get('pageSetup') !== undefined) entry.delete('pageSetup')
		}
	}, LOCAL_ORIGIN)
}

export function setPageSetupForTab(doc: Y.Doc, tabId: string, setup: PageSetup): void {
	doc.transact(() => {
		tabsRoot(doc).meta.get(tabId)?.set('pageSetup', setup)
	}, LOCAL_ORIGIN)
}

/**
 * Tipografi diselesaikan dengan tangga yang sama seperti `pageSetup`: milik tab
 * kalau ada, kalau tidak milik dokumen, kalau tidak bawaan pengguna.
 */
export function resolveTypography(
	doc: Y.Doc,
	tabId: string,
	fallback: DocumentTypography = DEFAULT_TYPOGRAPHY,
): DocumentTypography {
	const tab = readMeta(tabsRoot(doc).meta, tabId).typography
	if (tab) return tab

	const docId = findTabDoc(doc, tabId)
	const documentTypography = docId ? readDocMeta(docsRoot(doc).meta, docId).typography : null
	return documentTypography ?? fallback
}

export function setTypographyForDoc(doc: Y.Doc, docId: string, typography: DocumentTypography): void {
	const { meta: docsMeta } = docsRoot(doc)
	const { meta: tabsMeta } = tabsRoot(doc)
	const tabIds = readDocMeta(docsMeta, docId).tabOrder

	doc.transact(() => {
		docsMeta.get(docId)?.set(TYPOGRAPHY, typography)
		for (const tabId of tabIds) {
			const entry = tabsMeta.get(tabId)
			if (entry?.get(TYPOGRAPHY) !== undefined) entry.delete(TYPOGRAPHY)
		}
	}, LOCAL_ORIGIN)
}

export function setTypographyForTab(doc: Y.Doc, tabId: string, typography: DocumentTypography): void {
	doc.transact(() => {
		tabsRoot(doc).meta.get(tabId)?.set(TYPOGRAPHY, typography)
	}, LOCAL_ORIGIN)
}

export function migratePageSetup(doc: Y.Doc, docId: string, fallback: PageSetup): boolean {
	const { meta: docsMeta } = docsRoot(doc)
	const entry = docsMeta.get(docId)
	if (!entry || entry.get('pageSetup') !== undefined) return false

	doc.transact(() => {
		entry.set('pageSetup', fallback)
	}, LOCAL_ORIGIN)
	return true
}

export function tabPreview(doc: Y.Doc, id: string, limit = 64): string {
	const pieces: string[] = []
	let total = 0

	const walk = (node: Y.XmlElement | Y.XmlText | Y.XmlHook | Y.XmlFragment): void => {
		if (total >= limit) return

		if (node instanceof Y.XmlText) {
			for (const part of node.toDelta() as Array<{ insert?: unknown }>) {
				if (typeof part.insert !== 'string') continue
				pieces.push(part.insert)
				total += part.insert.length
				if (total >= limit) return
			}
			return
		}

		if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
			for (const child of node.toArray()) {
				walk(child)
				if (total >= limit) return
			}
			pieces.push(' ')
		}
	}

	walk(doc.getXmlFragment(id))
	return pieces.join('').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function touchTab(doc: Y.Doc, id: string): void {
	const parentId = findTabDoc(doc, id)
	doc.transact(() => {
		tabsRoot(doc).meta.get(id)?.set('updatedAt', Date.now())
		if (parentId) docsRoot(doc).meta.get(parentId)?.set('updatedAt', Date.now())
	}, LOCAL_ORIGIN)
}

export function readTabs(doc: Y.Doc, docId?: string): TabMeta[] {
	const { meta } = tabsRoot(doc)

	if (docId !== undefined) {
		const entry = docsRoot(doc).meta.get(docId)
		const tabOrder = (entry?.get(TAB_ORDER) as Y.Array<string> | undefined)?.toArray() ?? []
		return tabOrder.filter((id) => meta.has(id)).map((id) => readMeta(meta, id))
	}

	const ordered = readDocs(doc).flatMap((dok) => dok.tabOrder)
	const listed = new Set(ordered)
	const orphans = [...meta.keys()].filter((id) => !listed.has(id))
	return [...ordered, ...orphans].filter((id) => meta.has(id)).map((id) => readMeta(meta, id))
}

export function readDocs(doc: Y.Doc): DocMeta[] {
	const { order, meta } = docsRoot(doc)
	return order
		.toArray()
		.filter((id) => meta.has(id))
		.map((id) => readDocMeta(meta, id))
}

export function findTabDoc(doc: Y.Doc, tabId: string): string | null {
	const { order, meta } = docsRoot(doc)
	for (const docId of order.toArray()) {
		const tabOrder = meta.get(docId)?.get(TAB_ORDER) as Y.Array<string> | undefined
		if (tabOrder?.toArray().includes(tabId)) return docId
	}
	return null
}

function writeTabEntry(doc: Y.Doc, tabId: string, title: string): void {
	const entry = new Y.Map<unknown>()
	entry.set('title', title)
	entry.set('emoji', null)
	entry.set('language', null)
	entry.set('comments', [])
	entry.set('updatedAt', Date.now())
	tabsRoot(doc).meta.set(tabId, entry)
	doc.getXmlFragment(tabId)
}

function writeDocEntry(doc: Y.Doc, docId: string, title: string, tabIds: string[]): void {
	const tabOrder = new Y.Array<string>()
	tabOrder.push(tabIds)
	const entry = new Y.Map<unknown>()
	entry.set('title', title)
	entry.set(TAB_ORDER, tabOrder)
	entry.set('updatedAt', Date.now())
	docsRoot(doc).meta.set(docId, entry)
}

function clearFragment(doc: Y.Doc, tabId: string): void {
	const fragment = doc.getXmlFragment(tabId)
	if (fragment.length > 0) fragment.delete(0, fragment.length)
}

export function createDocument(doc: Y.Doc, title = 'Untitled document', atIndex?: number): string {
	const { order } = docsRoot(doc)
	const id = createDocId()

	doc.transact(() => {
		const tabId = createTabId()
		writeDocEntry(doc, id, title, [tabId])
		writeTabEntry(doc, tabId, title)
		order.insert(atIndex ?? order.length, [id])
	}, LOCAL_ORIGIN)

	return id
}

export function deleteDocument(doc: Y.Doc, id: string): void {
	doc.transact(() => {
		const docs = docsRoot(doc)
		const entry = docs.meta.get(id)
		if (!entry) return

		const tabOrder = (entry.get(TAB_ORDER) as Y.Array<string> | undefined)?.toArray() ?? []
		const tabs = tabsRoot(doc).meta
		for (const tabId of tabOrder) {
			tabs.delete(tabId)
			clearFragment(doc, tabId)
		}

		docs.meta.delete(id)
		const at = docs.order.toArray().indexOf(id)
		if (at !== -1) docs.order.delete(at, 1)
	}, LOCAL_ORIGIN)
}

export function renameDocument(doc: Y.Doc, id: string, title: string, origin: unknown = LOCAL_ORIGIN): void {
	const entry = docsRoot(doc).meta.get(id)
	if (!entry) return

	doc.transact(() => {
		entry.set('title', title)
		entry.set('titleUpdatedAt', Date.now())
		entry.set('updatedAt', Date.now())
	}, origin)
}

export function moveDocument(doc: Y.Doc, movedId: string, destId: string): void {
	if (movedId === destId) return
	const { order } = docsRoot(doc)

	doc.transact(() => {
		const ids = order.toArray()
		const from = ids.indexOf(movedId)
		const to = ids.indexOf(destId)
		if (from === -1 || to === -1) return

		order.delete(from, 1)
		order.insert(to, [movedId])
	}, LOCAL_ORIGIN)
}

export function createTab(doc: Y.Doc, docId: string, title = 'Untitled document', atIndex?: number): string {
	const entry = docsRoot(doc).meta.get(docId)
	if (!entry) throw new Error(`createTab: dokumen "${docId}" tidak ada`)

	const id = createTabId()

	doc.transact(() => {
		writeTabEntry(doc, id, title)
		const tabOrder = entry.get(TAB_ORDER) as Y.Array<string>
		tabOrder.insert(atIndex ?? tabOrder.length, [id])
		entry.set('updatedAt', Date.now())
	}, LOCAL_ORIGIN)

	return id
}

export function deleteTab(doc: Y.Doc, id: string): void {
	doc.transact(() => {
		const { meta } = tabsRoot(doc)
		meta.delete(id)
		clearFragment(doc, id)

		const parentId = findTabDoc(doc, id)
		if (!parentId) return
		const docs = docsRoot(doc)
		const entry = docs.meta.get(parentId)
		const tabOrder = entry?.get(TAB_ORDER) as Y.Array<string> | undefined
		if (!entry || !tabOrder) return

		const at = tabOrder.toArray().indexOf(id)
		if (at !== -1) tabOrder.delete(at, 1)

		if (tabOrder.length === 0) {
			docs.meta.delete(parentId)
			const docAt = docs.order.toArray().indexOf(parentId)
			if (docAt !== -1) docs.order.delete(docAt, 1)
		} else {
			entry.set('updatedAt', Date.now())
		}
	}, LOCAL_ORIGIN)
}

export function updateTab(doc: Y.Doc, id: string, patch: Partial<Omit<TabMeta, 'id'>>): void {
	const { meta } = tabsRoot(doc)

	doc.transact(() => {
		const entry = meta.get(id)
		if (!entry) return
		for (const [key, value] of Object.entries(patch)) entry.set(key, value)
	}, LOCAL_ORIGIN)
}

export function moveTab(doc: Y.Doc, movedId: string, destId: string): void {
	if (movedId === destId) return
	const parentId = findTabDoc(doc, destId)
	if (!parentId || findTabDoc(doc, movedId) !== parentId) return

	doc.transact(() => {
		const tabOrder = docsRoot(doc).meta.get(parentId)?.get(TAB_ORDER) as Y.Array<string> | undefined
		if (!tabOrder) return
		const ids = tabOrder.toArray()
		const from = ids.indexOf(movedId)
		const to = ids.indexOf(destId)
		if (from === -1 || to === -1) return

		tabOrder.delete(from, 1)
		tabOrder.insert(to, [movedId])
	}, LOCAL_ORIGIN)
}

function cloneFragment(source: Y.XmlFragment, target: Y.XmlFragment): void {
	const copies = source
		.toArray()
		.map((node) => (node instanceof Y.XmlElement || node instanceof Y.XmlText ? node.clone() : null))
		.filter((node): node is Y.XmlElement | Y.XmlText => node !== null)

	target.insert(target.length, copies)
}

export function duplicateTab(doc: Y.Doc, id: string): string | null {
	const { meta } = tabsRoot(doc)
	const source = meta.get(id)
	if (!source) return null

	const parentId = findTabDoc(doc, id)
	const copyId = createTabId()

	doc.transact(() => {
		const entry = new Y.Map<unknown>()
		entry.set('title', `${(source.get('title') as string) ?? 'Untitled document'} (salinan)`)
		entry.set('emoji', source.get('emoji') ?? null)
		entry.set('language', source.get('language') ?? null)
		entry.set('comments', [])
		entry.set('updatedAt', Date.now())
		meta.set(copyId, entry)

		if (parentId) {
			const tabOrder = docsRoot(doc).meta.get(parentId)?.get(TAB_ORDER) as Y.Array<string> | undefined
			if (tabOrder) {
				const at = tabOrder.toArray().indexOf(id)
				tabOrder.insert(at === -1 ? tabOrder.length : at + 1, [copyId])
			}
		}
		cloneFragment(doc.getXmlFragment(id), doc.getXmlFragment(copyId))
	}, LOCAL_ORIGIN)

	return copyId
}
