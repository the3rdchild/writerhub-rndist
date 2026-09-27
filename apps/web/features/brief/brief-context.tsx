'use client'

import { useQueryClient } from '@tanstack/react-query'
import {
	acceptProposal as acceptInBrief,
	applyAiBriefUpdate,
	applyOutline as applyOutlineToBrief,
	type BriefChapter,
	type BriefChapterUpdate,
	type BriefFieldUpdate,
	type BriefKey,
	type BriefTab,
	type BriefUpdateReport,
	briefField,
	chapterKey,
	confirmEntry,
	type DocumentMetadata,
	EMPTY_BRIEF,
	type OutlineReport,
	type OutlineUpdate,
	type ResearchBrief,
	rejectProposal as rejectInBrief,
	setUserChapters,
	setUserEntry,
	type TemplateMetadataField,
} from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type * as Y from 'yjs'
import { usePanels } from '@/features/analysis/panel-context'
import { updateDocument } from '@/features/documents/api'
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/use-documents'
import { useSessions } from '@/features/sessions/session-context'
import { readTabs } from '@/features/sessions/ydoc'
import { fragmentToJSON } from '@/features/sync/serialize'
import { useSync } from '@/features/sync/sync-context'
import { useActiveDocumentMetadata, useActiveTemplate } from '@/features/templates/use-templates'
import { briefSyncKey, readDocBrief, writeDocBrief } from './brief-ydoc'
import { chapterFingerprints, chapterTextLengths, withWrittenChapters } from './chapters'
import { seedBriefFromTemplate } from './seed'

export interface BriefPanelState {
	open: boolean
	minimized: boolean
	tab: BriefTab
	/** Isian yang diminta AI lewat `request_brief` - disorot sampai penulis selesai. */
	highlight: BriefKey[]
	message: string | null
	/** Dokumen tempat permintaan itu dibuat; sorotan tidak ikut pindah dokumen. */
	requestDocId: string | null
}

const CLOSED_PANEL: BriefPanelState = {
	open: false,
	minimized: false,
	tab: 'research',
	highlight: [],
	message: null,
	requestDocId: null,
}

/**
 * Isian identitas template - nama, NIM, prodi. Tetap tersimpan di metadata
 * dokumen server seperti sebelumnya, karena dari sanalah sampul diisi; panel
 * hanya menjadi tempat baru untuk menyuntingnya.
 */
export interface BriefIdentity {
	templateName: string
	fields: TemplateMetadataField[]
	values: DocumentMetadata
	saving: boolean
	error: string | null
	save: (next: DocumentMetadata) => Promise<boolean>
}

interface BriefContextValue {
	docId: string | null
	brief: ResearchBrief
	/**
	 * Brief SAAT INI, dibaca langsung dari Y.Doc. `brief` baru berubah sesudah
	 * render berikutnya, sedangkan chat melanjutkan gilirannya di tick yang
	 * sama dengan jawaban yang baru saja disimpan - membaca `brief` di sana
	 * berarti mengirim model versi sebelum jawaban itu.
	 */
	snapshot: () => ResearchBrief
	setField: (key: BriefKey, value: string) => void
	confirmField: (key: BriefKey) => void
	setChapters: (chapters: BriefChapter[]) => void
	acceptProposal: (id: string) => void
	rejectProposal: (id: string) => void
	/** Jalur alat `update_brief`; `null` bila tidak ada dokumen yang terbuka. */
	applyAiUpdate: (
		update: { fields?: BriefFieldUpdate[]; chapters?: BriefChapterUpdate[] },
		evidenceSources: readonly string[],
	) => BriefUpdateReport | null
	/** Jalur alat `set_outline`; `null` bila tidak ada dokumen yang terbuka. */
	applyOutline: (outline: OutlineUpdate) => OutlineReport | null
	/** Jawaban kartu pertanyaan yang ditujukan ke satu isian brief: keputusan penulis sendiri. */
	saveWriterAnswer: (key: BriefKey, value: string) => void
	/** Sidik jari isi bab sekarang, dihitung dari semua tab dokumen. */
	fingerprints: () => Map<string, string>
	identity: BriefIdentity | null
	panel: BriefPanelState
	openPanel: (options?: { tab?: BriefTab; highlight?: BriefKey[]; message?: string }) => void
	minimizePanel: () => void
	closePanel: () => void
	setPanelTab: (tab: BriefTab) => void
	clearRequest: () => void
}

const BriefContext = createContext<BriefContextValue | null>(null)

export function BriefProvider({ children }: { children: ReactNode }) {
	const { doc, activeDocId, activeId, hydrated } = useSessions()
	const { linkage } = useSync()
	const { setActivePanel } = usePanels()
	const queryClient = useQueryClient()
	const template = useActiveTemplate()
	const metadata = useActiveDocumentMetadata()

	const read = useCallback(
		(): ResearchBrief => (activeDocId ? readDocBrief(doc, activeDocId) : null) ?? EMPTY_BRIEF,
		[doc, activeDocId],
	)
	const [brief, setBrief] = useState<ResearchBrief>(read)

	/*
	 * Meta dokumen berubah untuk banyak hal selain brief - judul, tata letak,
	 * urutan tab. Brief yang isinya sama tidak boleh menjadi objek baru: panel
	 * dan chat akan menggambar ulang di setiap ketukan judul.
	 */
	const refresh = useCallback(() => {
		const next = read()
		setBrief((current) => (briefSyncKey(current) === briefSyncKey(next) ? current : next))
	}, [read])

	useEffect(
		function readBriefOfActiveDocument() {
			if (hydrated) refresh()
		},
		[hydrated, refresh],
	)
	useEffect(
		function observeBriefChanges() {
			if (!hydrated) return
			const docsMeta = doc.getMap('docs').get('meta') as Y.Map<Y.Map<unknown>> | undefined
			docsMeta?.observeDeep(refresh)
			return () => docsMeta?.unobserveDeep(refresh)
		},
		[doc, hydrated, refresh],
	)

	const mutate = useCallback(
		(change: (current: ResearchBrief) => ResearchBrief): void => {
			if (!activeDocId) return
			const current = readDocBrief(doc, activeDocId) ?? EMPTY_BRIEF
			const next = change(current)
			if (next !== current) writeDocBrief(doc, activeDocId, next)
		},
		[doc, activeDocId],
	)

	useEffect(
		function seedFromTemplate() {
			if (!hydrated || !activeDocId || !template) return
			mutate((current) => seedBriefFromTemplate(current, template, metadata, Date.now()) ?? current)
		},
		[hydrated, activeDocId, template, metadata, mutate],
	)

	const fingerprints = useCallback((): Map<string, string> => {
		if (!activeDocId) return new Map()
		return chapterFingerprints(readTabs(doc, activeDocId).map((tab) => fragmentToJSON(doc, tab.id)))
	}, [doc, activeDocId])

	/* Yang dikirim ke AI: brief tersimpan, dengan status bab disesuaikan ke
	 * naskah sekarang - dibaca dari Y.Doc, bukan dari state render terakhir. */
	const snapshot = useCallback((): ResearchBrief => {
		const current = read()
		if (!activeDocId || !current.chapters.some((chapter) => chapter.status === 'belum')) return current
		const tabs = readTabs(doc, activeDocId).map((tab) => fragmentToJSON(doc, tab.id))
		return withWrittenChapters(current, chapterTextLengths(tabs))
	}, [read, doc, activeDocId])

	const applyAiUpdate = useCallback(
		(
			update: { fields?: BriefFieldUpdate[]; chapters?: BriefChapterUpdate[] },
			evidenceSources: readonly string[],
		): BriefUpdateReport | null => {
			if (!activeDocId) return null
			let report: BriefUpdateReport | null = null
			const prints = update.chapters?.length ? fingerprints() : new Map<string, string>()
			mutate((current) => {
				const result = applyAiBriefUpdate(current, update, {
					now: Date.now(),
					evidenceSources,
					fingerprintOf: (title) => prints.get(chapterKey(title)),
				})
				report = result.report
				return result.brief
			})
			return report
		},
		[activeDocId, mutate, fingerprints],
	)

	const applyOutline = useCallback(
		(outline: OutlineUpdate): OutlineReport | null => {
			if (!activeDocId) return null
			let report: OutlineReport | null = null
			mutate((current) => {
				const result = applyOutlineToBrief(current, outline, Date.now())
				report = result.report
				return result.brief
			})
			return report
		},
		[activeDocId, mutate],
	)

	const [panel, setPanel] = useState<BriefPanelState>(CLOSED_PANEL)

	useEffect(
		function forgetRequestOnDocumentChange() {
			setPanel((current) =>
				current.requestDocId === null || current.requestDocId === activeDocId
					? current
					: { ...current, highlight: [], message: null, requestDocId: null },
			)
		},
		[activeDocId],
	)

	const openPanel = useCallback(
		(options: { tab?: BriefTab; highlight?: BriefKey[]; message?: string } = {}) => {
			// Panel ini menempel di panel chat; membukanya dari menu File berarti
			// chat ikut terbuka, kalau tidak ia tidak punya tempat berdiri.
			setActivePanel('ai_chat')
			const highlight = options.highlight ?? []
			const firstTab = highlight.length > 0 ? briefField(highlight[0])?.tab : undefined
			setPanel((current) => ({
				open: true,
				minimized: false,
				tab: options.tab ?? firstTab ?? current.tab,
				highlight,
				message: options.message ?? null,
				requestDocId: highlight.length > 0 ? activeDocId : null,
			}))
		},
		[setActivePanel, activeDocId],
	)

	const [identitySaving, setIdentitySaving] = useState(false)
	const [identityError, setIdentityError] = useState<string | null>(null)
	const documentId = activeId ? linkage[activeId]?.documentId : undefined

	const identity = useMemo<BriefIdentity | null>(() => {
		const fields = template?.spec.metadataFields?.filter((field) => !field.briefKey) ?? []
		if (!template || fields.length === 0 || !documentId) return null
		return {
			templateName: template.name,
			fields,
			values: metadata ?? {},
			saving: identitySaving,
			error: identityError,
			save: async (next) => {
				setIdentitySaving(true)
				setIdentityError(null)
				try {
					/* Isian yang sudah pindah ke brief tetap ikut dikirim apa adanya:
					 * metadata ditulis utuh, dan menghilangkannya berarti menghapusnya. */
					await updateDocument(documentId, { metadata: { ...(metadata ?? {}), ...next } })
					await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
					return true
				} catch (cause) {
					setIdentityError(cause instanceof Error ? cause.message : 'Gagal menyimpan identitas')
					return false
				} finally {
					setIdentitySaving(false)
				}
			},
		}
	}, [template, documentId, metadata, identitySaving, identityError, queryClient])

	const value = useMemo<BriefContextValue>(
		() => ({
			docId: activeDocId,
			brief,
			snapshot,
			setField: (key, next) => mutate((current) => setUserEntry(current, key, next, Date.now())),
			confirmField: (key) => mutate((current) => confirmEntry(current, key, Date.now())),
			setChapters: (chapters) => mutate((current) => setUserChapters(current, chapters)),
			acceptProposal: (id) => mutate((current) => acceptInBrief(current, id, Date.now())),
			rejectProposal: (id) => mutate((current) => rejectInBrief(current, id)),
			applyAiUpdate,
			applyOutline,
			saveWriterAnswer: (key, next) => mutate((current) => setUserEntry(current, key, next, Date.now())),
			fingerprints,
			identity,
			panel,
			openPanel,
			minimizePanel: () => setPanel((current) => ({ ...current, minimized: true })),
			closePanel: () => setPanel((current) => ({ ...CLOSED_PANEL, tab: current.tab })),
			setPanelTab: (tab) => setPanel((current) => ({ ...current, tab })),
			clearRequest: () =>
				setPanel((current) => ({ ...current, highlight: [], message: null, requestDocId: null })),
		}),
		[
			activeDocId,
			brief,
			snapshot,
			mutate,
			applyAiUpdate,
			applyOutline,
			fingerprints,
			identity,
			panel,
			openPanel,
		],
	)

	return <BriefContext.Provider value={value}>{children}</BriefContext.Provider>
}

export function useBrief(): BriefContextValue {
	const context = useContext(BriefContext)
	if (!context) throw new Error('useBrief harus dipakai di dalam <BriefProvider>')
	return context
}
