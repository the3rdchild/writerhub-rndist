'use client'

import type { JSONContent } from '@tiptap/core'
import type { CollabRole } from '@writer-hub/shared'
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import type * as Y from 'yjs'
import { getTab } from '@/features/documents/api'
import { useSessions } from '@/features/sessions/session-context'
import { buildSchema } from '@/features/sync/serialize'
import { BACKUP_LABEL, backupDiscardedCopy, discardedContent } from './backup'
import {
	bindingOf,
	type CollabBinding,
	type CollabNotice,
	type Collaborator,
	INACTIVE_PHASES,
	newNoticeId,
	phaseOf,
	useCollaborators,
} from './binding'
import { indexeddbCollabStore } from './local-store'
import { createFragmentMirror, type FragmentMirror } from './mirror'
import { seedUpdateFromFragment, seedUpdateFromJSON } from './seed'
import { type CollabPhase, CollabSession, type SeedRequest } from './session'

interface CollabContextValue {
	binding: CollabBinding
	/** Fase sesi tab aktif; null bila tab aktif tidak kolaboratif. */
	phase: CollabPhase | null
	role: CollabRole | null
	collaborators: Collaborator[]
	notices: CollabNotice[]
	dismissNotice: (id: string) => void
}

const CollabContext = createContext<CollabContextValue | null>(null)

/** Sesi di latar (tab ditinggalkan dengan suntingan belum terkirim) paling banyak sekian. */
const MAX_BACKGROUND = 5
/** Sesi latar dilepas sekian lama setelah tersinkron - cukup untuk mengosongkan antrean kirim. */
const RETIRE_AFTER_SYNC_MS = 2000

interface Entry {
	localTabId: string
	serverTabId: string
	session: CollabSession
	mirror: FragmentMirror | null
	mirroredDoc: Y.Doc | null
	background: boolean
	backgroundSince: number
	retireTimer: ReturnType<typeof setTimeout> | null
}

export function CollabProvider({
	children,
	linkage,
	onCollabTab,
}: {
	children: ReactNode
	/** Tautan tab lokal → tab server (milik `features/sync`). */
	linkage: Readonly<Record<string, { serverId: string }>>
	/** Kabari penyimpan cloud: isi tab ini mengalir lewat websocket, jangan PUT naskahnya. */
	onCollabTab: (localTabId: string, collaborative: boolean) => void
}) {
	const { doc, activeId, whenLoaded } = useSessions()
	const schema = useMemo(() => buildSchema(), [])
	// Penanda sesi peramban ini di kehadiran: dua tab peramban milik orang yang
	// sama tampil berbeda warna.
	const [presenceKey] = useState(newNoticeId)
	const entries = useRef(new Map<string, Entry>())
	const [, setRevision] = useState(0)
	const bump = useCallback(() => setRevision((value) => value + 1), [])
	const [notices, setNotices] = useState<CollabNotice[]>([])
	const onCollabTabRef = useRef(onCollabTab)
	onCollabTabRef.current = onCollabTab

	const notify = useCallback((notice: Omit<CollabNotice, 'id'>) => {
		setNotices((current) => [...current, { ...notice, id: newNoticeId() }])
	}, [])
	const dismissNotice = useCallback((id: string) => {
		setNotices((current) => current.filter((notice) => notice.id !== id))
	}, [])

	/*
	 * Isi awal tab yang belum kolaboratif. `initial`: salinan persis tab di
	 * Y.Doc besar - itu yang sedang dilihat pengguna, termasuk suntingan yang
	 * belum sempat di-PUT. `reset`: state server baru saja dibuang (pulihkan
	 * versi, draf), jadi isi server yang berlaku; salinan lokal sudah basi.
	 */
	const seedFor = useCallback(
		async (request: SeedRequest, localTabId: string, serverTabId: string): Promise<Uint8Array | null> => {
			if (request.reason === 'initial') {
				await whenLoaded()
				const fragment = doc.getXmlFragment(localTabId)
				if (fragment.length > 0) return seedUpdateFromFragment(fragment)
			}
			const tab = await getTab(serverTabId)
			return seedUpdateFromJSON(tab.content as JSONContent, schema)
		},
		[doc, schema, whenLoaded],
	)

	const onDiscarded = useCallback(
		(discarded: Y.Doc, localTabId: string, serverTabId: string) => {
			// Dibaca sekarang juga: sesi membuang Y.Doc itu segera setelah kabar ini.
			const content = discardedContent(discarded, schema)
			if (!content) return
			void backupDiscardedCopy({ content, serverTabId, localTabId, canUseServer: true }).then((result) => {
				if (result.kind === 'server') {
					notify({
						message: `This tab was reset on the server (for example, a version was restored). Your previous copy is saved in Version history as "${BACKUP_LABEL}".`,
					})
				} else {
					notify({
						message:
							'This tab was reset on the server. Your previous copy could not be added to Version history; it is kept in this browser. Copy it now if you need it.',
						copyText: result.text,
					})
				}
			})
		},
		[schema, notify],
	)

	/** Cermin ke Y.Doc besar mengikuti `doc` sesi yang memegang isi. */
	const syncMirror = useCallback(
		(entry: Entry) => {
			const { session } = entry
			const source = session.contentReady && !INACTIVE_PHASES.has(session.phase) ? session.doc : null
			if (entry.mirroredDoc === source) return
			// Y.Doc lama yang dibuang (reset) TIDAK disalin lagi: isinya basi dan
			// sudah dicadangkan; menyalinnya akan menimpa isi yang dipulihkan.
			entry.mirror?.destroy()
			entry.mirror = null
			entry.mirroredDoc = source
			if (!source) return
			entry.mirror = createFragmentMirror({ source, target: doc, targetField: entry.localTabId, schema })
			// Sekali sekarang: isi server bisa sudah berbeda dari salinan di Y.Doc besar.
			entry.mirror.flush()
		},
		[doc, schema],
	)

	const retire = useCallback((entry: Entry) => {
		if (entry.retireTimer) clearTimeout(entry.retireTimer)
		if (entry.mirror && entry.mirroredDoc === entry.session.doc) entry.mirror.flush()
		entry.mirror?.destroy()
		entry.session.destroy()
		entries.current.delete(entry.localTabId)
		onCollabTabRef.current(entry.localTabId, false)
	}, [])

	const ensureEntry = useCallback(
		(localTabId: string, serverTabId: string): Entry => {
			const existing = entries.current.get(localTabId)
			if (existing && existing.serverTabId === serverTabId) return existing
			if (existing) retire(existing)

			const session = new CollabSession({
				tabId: serverTabId,
				localStore: indexeddbCollabStore,
				presenceKey,
				// Aplikasi utama hanya membuka tab milik penggunanya sendiri.
				assumeRole: 'editor',
				seed: (request) => seedFor(request, localTabId, serverTabId),
			})
			const entry: Entry = {
				localTabId,
				serverTabId,
				session,
				mirror: null,
				mirroredDoc: null,
				background: false,
				backgroundSince: 0,
				retireTimer: null,
			}
			session.on('change', () => {
				if (entries.current.get(localTabId) !== entry) return
				syncMirror(entry)
				onCollabTabRef.current(localTabId, session.contentReady && !INACTIVE_PHASES.has(session.phase))
				// Sesi latar sudah mengirim semuanya: lepas.
				if (entry.background && session.phase === 'synced' && !entry.retireTimer) {
					entry.retireTimer = setTimeout(() => retire(entry), RETIRE_AFTER_SYNC_MS)
				}
				bump()
			})
			session.on('discard', (discarded) => onDiscarded(discarded, localTabId, serverTabId))
			entries.current.set(localTabId, entry)
			void whenLoaded().then(() => session.start())
			return entry
		},
		[presenceKey, seedFor, syncMirror, onDiscarded, retire, whenLoaded, bump],
	)

	useEffect(
		function followActiveTab() {
			const activeServerTabId = activeId ? (linkage[activeId]?.serverId ?? null) : null
			for (const entry of [...entries.current.values()]) {
				if (entry.localTabId === activeId && entry.serverTabId === activeServerTabId) continue
				const { session } = entry
				// Tab ditinggalkan. Yang suntingannya mungkin belum terkirim (luring,
				// sedang menyambung) tetap hidup di latar sampai tersinkron.
				const pending =
					session.contentReady && session.phase !== 'synced' && !INACTIVE_PHASES.has(session.phase)
				if (!linkage[entry.localTabId] || !pending) {
					retire(entry)
					continue
				}
				if (!entry.background) {
					entry.background = true
					entry.backgroundSince = Date.now()
					session.setPresent(false)
				}
			}
			const background = [...entries.current.values()]
				.filter((entry) => entry.background)
				.sort((a, b) => a.backgroundSince - b.backgroundSince)
			for (const entry of background.slice(0, Math.max(0, background.length - MAX_BACKGROUND))) retire(entry)

			if (activeId && activeServerTabId) {
				const entry = ensureEntry(activeId, activeServerTabId)
				if (entry.retireTimer) clearTimeout(entry.retireTimer)
				entry.retireTimer = null
				if (entry.background) {
					entry.background = false
					entry.session.setPresent(true)
				}
			}
			bump()
		},
		[activeId, linkage, ensureEntry, retire, bump],
	)

	useEffect(
		function retireAllOnUnmount() {
			const map = entries.current
			return () => {
				for (const entry of [...map.values()]) retire(entry)
			}
		},
		[retire],
	)

	const active = activeId ? entries.current.get(activeId) : undefined
	const activeSession = active && linkage[active.localTabId] ? active.session : null
	// Provider berganti saat sesi mulai ulang dengan Y.Doc baru.
	const activeProvider = activeSession?.provider ?? null

	const collaborators = useCollaborators(activeProvider)

	const binding = bindingOf(activeSession)
	const phase = phaseOf(activeSession)

	const value: CollabContextValue = {
		binding,
		phase,
		role: activeSession ? activeSession.role : null,
		collaborators,
		notices,
		dismissNotice,
	}

	return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>
}

export function useCollab(): CollabContextValue {
	const context = useContext(CollabContext)
	if (!context) throw new Error('useCollab harus dipakai di dalam <CollabProvider>')
	return context
}
