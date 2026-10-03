'use client'

import type { JSONContent } from '@tiptap/core'
import { COLLAB_FRAGMENT, type CollabRole } from '@writer-hub/shared'
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
import { tabsRoot } from '@/features/sessions/ydoc'
import { buildSchema } from '@/features/sync/serialize'
import {
	BACKUP_LABEL,
	backupDiscardedCopy,
	discardedContent,
	FIRST_SYNC_LABEL,
	fragmentContent,
	sameContent,
} from './backup'
import {
	bindingOf,
	type CollabBinding,
	type CollabNotice,
	type Collaborator,
	handoverDelay,
	INACTIVE_PHASES,
	phaseOf,
	randomId,
	reconcileOnBind,
	useCollaborators,
} from './binding'
import { localEdits, touchesTab } from './local-edits'
import { indexeddbCollabStore } from './local-store'
import { createFragmentMirror, type FragmentMirror, mirrorFragment } from './mirror'
import { COLLAB_CARRY_ORIGIN, COLLAB_MIRROR_ORIGIN } from './origins'
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
/** Tab baru diserahkan ke sesinya setelah penulis berhenti mengetik sekian lama... */
const HANDOVER_QUIET_MS = 700
/** ...tetapi paling lambat sekian lama setelah sesinya memegang isi. */
const HANDOVER_MAX_MS = 5000

const LOCAL_BINDING: CollabBinding = { kind: 'local' }

interface Entry {
	localTabId: string
	serverTabId: string
	session: CollabSession
	mirror: FragmentMirror | null
	mirroredDoc: Y.Doc | null
	background: boolean
	backgroundSince: number
	retireTimer: ReturnType<typeof setTimeout> | null
	/** Peramban ini belum pernah memegang salinan kolaborasi tab ini saat sesinya dibuat. */
	firstBinding: boolean
	/**
	 * Tab server ini baru dibuat dari salinan lokal tab ini (simpan ke cloud,
	 * tab baru di dokumen cloud) dan belum diserahkan ke sesinya. Editor tetap
	 * di salinan lokal - tetap bisa diketik, tanpa jeda hanya-baca - dan saat
	 * sesinya memegang isi suntingan sejak semaian dibawa ke Y.Doc sesi.
	 */
	fresh: boolean
	/** Kapan sesi tab baru pertama memegang isi; batas tunda penyerahannya. */
	readySince: number
	handoverTimer: ReturnType<typeof setTimeout> | null
	/** Salinan lokal sudah dibereskan (dibawa atau dicadangkan) untuk sesi ini. */
	reconciled: boolean
}

/** Sesi memegang isi yang bisa diikat dan dicermin - juga saat kolaborasinya berhenti sementara. */
function holdsContent(session: CollabSession): boolean {
	return session.contentReady && session.phase !== 'gone' && session.phase !== 'destroyed'
}

export function CollabProvider({
	children,
	linkage,
	onCollabTab,
	isFreshTab,
	onHandedOver,
}: {
	children: ReactNode
	/** Tautan tab lokal → tab server (milik `features/sync`). */
	linkage: Readonly<Record<string, { serverId: string }>>
	/** Kabari penyimpan cloud: isi tab ini mengalir lewat websocket, jangan PUT naskahnya. */
	onCollabTab: (localTabId: string, collaborative: boolean) => void
	/** Tab server ini baru saja dibuat dari salinan lokal tab ini di halaman ini (`features/sync`). */
	isFreshTab?: (localTabId: string, serverTabId: string) => boolean
	/** Salinan lokal tab baru sudah diserahkan ke sesinya. */
	onHandedOver?: (localTabId: string) => void
}) {
	const { doc, activeId, whenLoaded } = useSessions()
	const schema = useMemo(() => buildSchema(), [])
	// Penanda sesi peramban ini di kehadiran: dua tab peramban milik orang yang
	// sama tampil berbeda warna.
	const [presenceKey] = useState(randomId)
	const entries = useRef(new Map<string, Entry>())
	const [, setRevision] = useState(0)
	const bump = useCallback(() => setRevision((value) => value + 1), [])
	const [notices, setNotices] = useState<CollabNotice[]>([])
	const onCollabTabRef = useRef(onCollabTab)
	onCollabTabRef.current = onCollabTab
	const isFreshTabRef = useRef(isFreshTab)
	isFreshTabRef.current = isFreshTab
	const onHandedOverRef = useRef(onHandedOver)
	onHandedOverRef.current = onHandedOver
	const activeIdRef = useRef(activeId)
	activeIdRef.current = activeId
	const linkageRef = useRef(linkage)
	linkageRef.current = linkage
	/** Jenis pengikatan editor tab aktif menurut render terakhir. */
	const bindingKindRef = useRef<CollabBinding['kind']>('local')

	const notify = useCallback((notice: Omit<CollabNotice, 'id'>) => {
		setNotices((current) => [...current, { ...notice, id: randomId() }])
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

	/*
	 * Salinan lokal bisa berisi suntingan yang tidak pernah sampai ke room:
	 * ditulis saat luring sebelum tab ini punya salinan kolaborasi di peramban
	 * ini (`first-sync`), atau saat editor tidak terikat ke sesi - sebelum
	 * sesinya dibuat, luring tanpa salinan kolaborasi (`local-edits`). Bila
	 * isinya berbeda dari isi server, salinannya dicadangkan sebagai versi dan
	 * penulisnya diberi tahu SEBELUM cermin menimpanya.
	 */
	const keepDivergentLocalCopy = useCallback(
		(entry: Entry, reason: 'first-sync' | 'local-edits') => {
			const local = fragmentContent(doc.getXmlFragment(entry.localTabId), schema)
			if (!local) return
			const remote = fragmentContent(entry.session.doc.getXmlFragment(COLLAB_FRAGMENT), schema)
			if (sameContent(local, remote)) return
			const lead =
				reason === 'first-sync'
					? 'This tab had changed elsewhere since this browser last saved it.'
					: 'Changes made in this browser while live editing was unavailable could not be merged with the live copy.'
			void backupDiscardedCopy({
				content: local,
				serverTabId: entry.serverTabId,
				localTabId: entry.localTabId,
				canUseServer: true,
				label: FIRST_SYNC_LABEL,
			}).then((result) => {
				notify(
					result.kind === 'server'
						? {
								message: `${lead} The copy that was here is saved in Version history as "${FIRST_SYNC_LABEL}".`,
							}
						: {
								message: `${lead} The copy that was here is kept in this browser. Copy it now if you need it.`,
								copyText: result.text,
							},
				)
			})
		},
		[doc, schema, notify],
	)

	/**
	 * Suntingan di salinan lokal tab baru sejak semaian dibawa ke Y.Doc sesi
	 * lewat diff: hanya selisihnya yang menjadi pembaruan Yjs, tersimpan di
	 * salinan kolaborasi lokal dan terkirim ke room seperti suntingan biasa.
	 * Hanya untuk sesi yang disemai dari salinan ini - di tempat lain diff ini
	 * akan membatalkan suntingan kolaborator.
	 */
	const carryLocalCopy = useCallback(
		(entry: Entry) => {
			mirrorFragment(
				doc.getXmlFragment(entry.localTabId),
				entry.session.doc,
				COLLAB_FRAGMENT,
				schema,
				COLLAB_CARRY_ORIGIN,
			)
		},
		[doc, schema],
	)

	/**
	 * Cermin ke Y.Doc besar mengikuti `doc` sesi yang memegang isi - juga saat
	 * kolaborasinya berhenti sementara, karena editor tetap terikat ke sana.
	 * Tab baru yang belum diserahkan tidak dicermin: salinan lokalnya yang benar.
	 */
	const syncMirror = useCallback(
		(entry: Entry) => {
			const { session } = entry
			const source = holdsContent(session) && !entry.fresh ? session.doc : null
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

	/** Sesi tab ini kini menerima suntingan editor; kabari penyimpan cloud. */
	const reportCollaborative = useCallback((entry: Entry) => {
		const { session } = entry
		onCollabTabRef.current(
			entry.localTabId,
			!entry.fresh && holdsContent(session) && !INACTIVE_PHASES.has(session.phase),
		)
	}, [])

	/** Tab baru: dari salinan lokal ke sesinya, sekali. */
	const handOver = useCallback(
		(entry: Entry) => {
			if (entry.handoverTimer) clearTimeout(entry.handoverTimer)
			entry.handoverTimer = null
			if (!entry.fresh) return
			if (holdsContent(entry.session)) carryLocalCopy(entry)
			entry.fresh = false
			entry.firstBinding = false
			entry.reconciled = true
			localEdits.clear(entry.localTabId)
			onHandedOverRef.current?.(entry.localTabId)
			syncMirror(entry)
			reportCollaborative(entry)
			bump()
		},
		[carryLocalCopy, syncMirror, reportCollaborative, bump],
	)

	const retire = useCallback(
		(entry: Entry) => {
			if (entry.retireTimer) clearTimeout(entry.retireTimer)
			if (entry.handoverTimer) clearTimeout(entry.handoverTimer)
			// Salinan terakhir ke Y.Doc besar - kecuali tabnya sudah dihapus: menulis
			// fragmennya lagi hanya meninggalkan isi yatim.
			const tabStillExists = tabsRoot(doc).meta.has(entry.localTabId)
			// Tab baru yang ditinggalkan sebelum diserahkan: suntingannya sejak
			// semaian tetap dibawa ke Y.Doc sesi (salinan kolaborasi lokalnya, lalu
			// room) sebelum sesinya ditutup. Tandanya di `features/sync` tetap ada,
			// jadi saat tab ini dibuka lagi penyerahannya diulang.
			if (entry.fresh && tabStillExists && holdsContent(entry.session)) carryLocalCopy(entry)
			if (entry.mirror && entry.mirroredDoc === entry.session.doc && tabStillExists) entry.mirror.flush()
			entry.mirror?.destroy()
			entry.session.destroy()
			entries.current.delete(entry.localTabId)
			onCollabTabRef.current(entry.localTabId, false)
		},
		[doc, carryLocalCopy],
	)

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
				firstBinding: indexeddbCollabStore.storedEpoch(serverTabId) === null,
				fresh: isFreshTabRef.current?.(localTabId, serverTabId) ?? false,
				readySince: 0,
				handoverTimer: null,
				reconciled: false,
			}
			// Tab baru diserahkan saat penulis berhenti mengetik sejenak: penyerahan
			// membuat ulang editor, dan ketukan di tengahnya jatuh di antara keduanya.
			const tryHandover = () => {
				if (entries.current.get(localTabId) !== entry || !entry.fresh || entry.handoverTimer) return
				if (!holdsContent(session)) return
				if (!entry.readySince) entry.readySince = Date.now()
				const wait = handoverDelay({
					now: Date.now(),
					lastEditAt: localEdits.lastEditAt(localTabId),
					readySince: entry.readySince,
					quietMs: HANDOVER_QUIET_MS,
					maxWaitMs: HANDOVER_MAX_MS,
				})
				if (wait > 0) {
					entry.handoverTimer = setTimeout(() => {
						entry.handoverTimer = null
						tryHandover()
					}, wait)
					return
				}
				handOver(entry)
			}
			session.on('change', () => {
				if (entries.current.get(localTabId) !== entry) return
				if (entry.fresh) {
					tryHandover()
					bump()
					return
				}
				// Sebelum cermin pertama: setelah itu salinan lokalnya sudah tertimpa.
				if (holdsContent(session) && !entry.reconciled) {
					entry.reconciled = true
					const plan = reconcileOnBind({
						fresh: false,
						firstBinding: entry.firstBinding,
						editedLocally: localEdits.has(localTabId),
					})
					if (plan === 'compare')
						keepDivergentLocalCopy(entry, entry.firstBinding ? 'first-sync' : 'local-edits')
					entry.firstBinding = false
					localEdits.clear(localTabId)
				}
				syncMirror(entry)
				reportCollaborative(entry)
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
		[
			presenceKey,
			seedFor,
			keepDivergentLocalCopy,
			syncMirror,
			reportCollaborative,
			handOver,
			onDiscarded,
			retire,
			whenLoaded,
			bump,
		],
	)

	/*
	 * Suntingan di salinan lokal tab cloud selagi editornya tidak terikat ke
	 * sesi (tab aktif, pengikatan `local`) ditandai - tahan muat ulang - supaya
	 * tidak tertimpa diam-diam saat sesinya memegang isi. Tulisan cermin dan
	 * pembaruan yang dimuat dari penyimpanan (bukan transaksi lokal) tidak
	 * dihitung.
	 */
	useEffect(
		function trackLocalEditsOfCloudTabs() {
			const onTransaction = (transaction: Y.Transaction) => {
				if (!transaction.local || transaction.origin === COLLAB_MIRROR_ORIGIN) return
				const tabId = activeIdRef.current
				if (!tabId || !linkageRef.current[tabId] || bindingKindRef.current !== 'local') return
				if (touchesTab(transaction, doc, tabId)) localEdits.mark(tabId)
			}
			doc.on('afterTransaction', onTransaction)
			return () => doc.off('afterTransaction', onTransaction)
		},
		[doc],
	)

	useEffect(
		function followActiveTab() {
			const activeServerTabId = activeId ? (linkage[activeId]?.serverId ?? null) : null
			let changed = false
			for (const entry of [...entries.current.values()]) {
				if (entry.localTabId === activeId && entry.serverTabId === activeServerTabId) continue
				const { session } = entry
				// Tab ditinggalkan. Yang suntingannya mungkin belum terkirim (luring,
				// sedang menyambung) tetap hidup di latar sampai tersinkron.
				const pending =
					session.contentReady && session.phase !== 'synced' && !INACTIVE_PHASES.has(session.phase)
				if (!linkage[entry.localTabId] || !pending) {
					retire(entry)
					changed = true
					continue
				}
				if (!entry.background) {
					entry.background = true
					entry.backgroundSince = Date.now()
					session.setPresent(false)
					changed = true
				}
			}
			const background = [...entries.current.values()]
				.filter((entry) => entry.background)
				.sort((a, b) => a.backgroundSince - b.backgroundSince)
			for (const entry of background.slice(0, Math.max(0, background.length - MAX_BACKGROUND))) {
				retire(entry)
				changed = true
			}

			if (activeId && activeServerTabId) {
				const known = entries.current.get(activeId)
				const entry = ensureEntry(activeId, activeServerTabId)
				if (entry !== known) changed = true
				if (entry.retireTimer) clearTimeout(entry.retireTimer)
				entry.retireTimer = null
				if (entry.background) {
					entry.background = false
					entry.session.setPresent(true)
					changed = true
				}
			}
			// `linkage` berganti pada setiap simpanan; render ulang hanya bila ada sesi yang berubah.
			if (changed) bump()
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

	// Tab baru yang belum diserahkan: editor tetap di salinan lokal, dan
	// indikatornya belum "Live" karena suntingannya belum terlihat kolaborator.
	const handingOver = active?.fresh === true && activeSession !== null
	const binding = handingOver ? LOCAL_BINDING : bindingOf(activeSession, { keepWhileInactive: true })
	bindingKindRef.current = binding.kind
	const sessionPhase = phaseOf(activeSession)
	const phase = handingOver && sessionPhase === 'synced' ? 'syncing' : sessionPhase

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
	if (!context) throw new Error('useCollab must be used inside <CollabProvider>')
	return context
}
