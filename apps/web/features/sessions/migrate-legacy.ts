'use client'

import { Editor } from '@tiptap/core'
import { prosemirrorToYXmlFragment } from 'y-prosemirror'
import type * as Y from 'yjs'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { textToParagraphs } from '@/features/editor/text-content'
import type { CommentThread } from './types'
import { createDocument, LOCAL_ORIGIN, readTabs, tabFragment, updateTab } from './ydoc'

/**
 * Naskah dari versi localStorage dipindahkan ke Y.Doc.
 *
 * Kunci lamanya sengaja TIDAK dihapus. Ia satu-satunya salinan naskah yang
 * dipunyai pengguna, dan pemindahan ini berjalan sekali di peramban mereka
 * tanpa ada yang mengawasi - kalau ada yang meleset, yang lama masih di
 * tempatnya untuk dibaca ulang. Yang menandai selesai adalah kunci tersendiri.
 */

export const LEGACY_SESSIONS_KEY = 'writer-hub-sessions'
export const MIGRATED_KEY = 'writer-hub-sessions-migrated'

interface LegacySession {
	id?: string
	title?: string
	text?: string
	html?: string
	emoji?: string | null
	language?: string | null
	comments?: CommentThread[]
}

interface LegacyStore {
	sessions?: LegacySession[]
	activeId?: string | null
}

function readLegacy(): LegacyStore | null {
	try {
		const raw = window.localStorage.getItem(LEGACY_SESSIONS_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as LegacyStore
		return Array.isArray(parsed?.sessions) && parsed.sessions.length > 0 ? parsed : null
	} catch {
		return null
	}
}

export function hasMigrated(): boolean {
	try {
		return window.localStorage.getItem(MIGRATED_KEY) === '1'
	} catch {
		return false
	}
}

function markMigrated(): void {
	try {
		window.localStorage.setItem(MIGRATED_KEY, '1')
	} catch {
		// mode privat atau kuota penuh - migrasi tetap sah untuk sesi ini
	}
}

/**
 * HTML tersimpan jadi isi fragmen.
 *
 * Lewat editor sementara dengan skema yang sama persis dengan editor sungguhan
 * (`buildEditorExtensions`): node yang tidak dikenal skema akan dibuang saat
 * naskah dibaca, jadi memakai skema seadanya di sini berarti tabel, rumus, dan
 * penanda komentar hilang dalam perjalanan.
 */
function fillFragment(doc: Y.Doc, tabId: string, html: string): void {
	const editor = new Editor({ extensions: buildEditorExtensions(), content: html })
	try {
		doc.transact(() => {
			prosemirrorToYXmlFragment(editor.state.doc, tabFragment(doc, tabId))
		}, LOCAL_ORIGIN)
	} finally {
		editor.destroy()
	}
}

/**
 * Pindahkan sesi lama ke `doc`. Mengembalikan id tab yang sebelumnya aktif,
 * supaya pengguna mendarat di naskah yang sama dengan sebelum pembaruan.
 */
export function migrateLegacySessions(doc: Y.Doc): { activeId: string | null } | null {
	if (hasMigrated()) return null

	const legacy = readLegacy()
	if (!legacy?.sessions?.length) {
		markMigrated()
		return null
	}

	let activeId: string | null = null

	for (const session of legacy.sessions) {
		// Tiap sesi lama jadi satu dokumen berisi satu tab - bentuk akhir yang
		// sama dengan migrasi struktur Y.Doc lama (`migrate-to-docs.ts`).
		const title = session.title?.trim() || 'Untitled document'
		const docId = createDocument(doc, title)
		const tabId = readTabs(doc, docId)[0]?.id
		if (!tabId) continue
		updateTab(doc, tabId, {
			emoji: session.emoji ?? null,
			language: session.language ?? null,
			comments: session.comments ?? [],
		})

		// Sesi paling awal hanya menyimpan teks polos; `html` menyusul belakangan.
		const html = session.html?.trim() || textToParagraphs(session.text ?? '')
		fillFragment(doc, tabId, html)

		if (session.id && session.id === legacy.activeId) activeId = tabId
	}

	markMigrated()
	return { activeId }
}
