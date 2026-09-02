import { describe, expect, test } from 'bun:test'
import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'
import * as Y from 'yjs'
import type { PageSetup } from '@/features/editor/page-geometry'
import { setPageFurnitureForTab } from '@/features/editor/page-furniture/page-furniture-ydoc'
import { createDocument, createTab, readDocs, readTabs, setPageSetupForDoc, setPageSetupForTab } from '@/features/sessions/ydoc'
import {
	applyDocLayout,
	applyTabLayout,
	layoutSyncKey,
	readDocLayout,
	readTabLayoutOverride,
} from './layout-sync'

const A5_SETUP: PageSetup = {
	size: 'a5',
	orientation: 'landscape',
	margins: { top: 48, right: 48, bottom: 48, left: 48 },
	pageColor: '#fff8e7',
	pageless: false,
}

const LETTER_SETUP: PageSetup = {
	size: 'letter',
	orientation: 'portrait',
	margins: { top: 96, right: 96, bottom: 96, left: 96 },
	pageColor: null,
	pageless: false,
}

function firstTabId(doc: Y.Doc, docId: string): string {
	const tab = readTabs(doc, docId)[0]
	if (!tab) throw new Error('dokumen tanpa tab')
	return tab.id
}

describe('putar-balik tata letak lokal <-> server', () => {
	test('dokumen baru tanpa tata letak menghasilkan null', () => {
		const doc = new Y.Doc()
		const docId = createDocument(doc, 'Polos')

		expect(readDocLayout(doc, docId)).toBeNull()
		expect(readTabLayoutOverride(doc, firstTabId(doc, docId))).toBeNull()
	})

	test('pageSetup dasar dokumen terbaca sebagai TabLayout', () => {
		const doc = new Y.Doc()
		const docId = createDocument(doc, 'Dasar')
		setPageSetupForDoc(doc, docId, A5_SETUP)

		expect(readDocLayout(doc, docId)).toEqual({ pageSetup: A5_SETUP })
	})

	test('penimpa tab memuat pageSetup dan perabot bervarian', () => {
		const doc = new Y.Doc()
		const docId = createDocument(doc, 'Tab')
		const tabId = firstTabId(doc, docId)
		const furniture = {
			header: { default: { text: 'Naskah', align: 'left' as const } },
			footer: {
				first: { text: 'Rahasia', align: 'center' as const },
				even: { text: '{page}', align: 'left' as const },
				default: { text: '{page}', align: 'right' as const },
			},
		}
		setPageSetupForTab(doc, tabId, LETTER_SETUP)
		setPageFurnitureForTab(doc, tabId, furniture)

		expect(readTabLayoutOverride(doc, tabId)).toEqual({ pageSetup: LETTER_SETUP, furniture })
	})

	test('applyDocLayout dan applyTabLayout mereproduksi tata letak persis', () => {
		const source = new Y.Doc()
		const sourceDocId = createDocument(source, 'Sumber')
		const sourceTabId = firstTabId(source, sourceDocId)
		const furniture = { footer: { default: { text: 'Hal {page}', align: 'right' as const } } }
		setPageSetupForDoc(source, sourceDocId, A5_SETUP)
		setPageSetupForTab(source, sourceTabId, LETTER_SETUP)
		setPageFurnitureForTab(source, sourceTabId, furniture)

		const docLayout = readDocLayout(source, sourceDocId)
		const tabLayout = readTabLayoutOverride(source, sourceTabId)

		const target = new Y.Doc()
		const targetDocId = createDocument(target, 'Tiruan')
		const targetTabId = firstTabId(target, targetDocId)
		applyDocLayout(target, targetDocId, docLayout)
		applyTabLayout(target, targetTabId, tabLayout)

		expect(readDocLayout(target, targetDocId)).toEqual(docLayout)
		expect(readTabLayoutOverride(target, targetTabId)).toEqual(tabLayout)
		expect(readDocs(target)[0].pageSetup).toEqual(A5_SETUP)
		expect(readTabs(target)[0].pageSetup).toEqual(LETTER_SETUP)
	})

	test('applyTabLayout null membersihkan penimpa', () => {
		const doc = new Y.Doc()
		const docId = createDocument(doc, 'Bersih')
		const tabId = firstTabId(doc, docId)
		setPageSetupForTab(doc, tabId, LETTER_SETUP)
		setPageFurnitureForTab(doc, tabId, { header: { default: { text: 'X', align: 'left' } } })

		applyTabLayout(doc, tabId, null)

		expect(readTabLayoutOverride(doc, tabId)).toBeNull()
	})

	test('layoutSyncKey stabil terhadap urutan properti', () => {
		const a: TabLayoutOverride = {
			pageSetup: LETTER_SETUP,
			furniture: { footer: { default: { text: '{page}', align: 'right' } } },
		}
		const b: TabLayoutOverride = {
			furniture: { footer: { default: { align: 'right', text: '{page}' } } },
			pageSetup: { ...LETTER_SETUP, margins: { left: 96, bottom: 96, right: 96, top: 96 } },
		}
		const c: TabLayout = { pageSetup: A5_SETUP }

		expect(layoutSyncKey(a)).toBe(layoutSyncKey(b))
		expect(layoutSyncKey(a)).not.toBe(layoutSyncKey(c))
		expect(layoutSyncKey(null)).toBe('')
	})
})
