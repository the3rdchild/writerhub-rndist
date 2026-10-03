import { useEffect, useState } from 'react'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'
import type { PresenceUser } from './presence'
import type { CollabPhase, CollabSession } from './session'

/**
 * Pengikatan editor untuk satu tab:
 * - `local`: tab belum di cloud, kolaborasi tidak tersedia, atau luring tanpa
 *   salinan kolaborasi - editor memakai salinan lokal seperti dulu.
 * - `pending`: tab cloud yang sesinya belum memegang isi (menyambung,
 *   menunggu semaian, sinkron pertama). Editor menampilkan salinan lokal
 *   HANYA-BACA: suntingan di sana akan tertimpa isi server.
 * - `live`: editor terikat ke Y.Doc sesi. `provider` null selama belum ada
 *   sambungan (salinan lokal dimuat saat luring) - tanpa kursor kolaborator.
 */
export type CollabBinding =
	| { kind: 'local' }
	| { kind: 'pending' }
	| {
			kind: 'live'
			doc: Y.Doc
			provider: WebsocketProvider | null
			user: PresenceUser | null
			readOnly: boolean
	  }

export interface Collaborator {
	clientId: number
	name: string
	color: string
}

export interface CollabNotice {
	id: string
	message: string
	/** Teks yang bisa disalin pengguna bila cadangannya tidak sampai ke riwayat versi. */
	copyText?: string
}

/** Fase yang berarti kolaborasi tidak berjalan untuk tab ini; editor kembali ke salinan lokal. */
export const INACTIVE_PHASES: ReadonlySet<CollabPhase> = new Set([
	'unavailable',
	'denied',
	'gone',
	'destroyed',
])

/**
 * `keepWhileInactive` (aplikasi utama): sesi yang sudah memegang isi tetap
 * diikat walau kolaborasinya berhenti - login habis (`denied`), kolaborasi
 * tidak tersedia (`unavailable`). Editor kembali ke Y.Doc besar di situ dulu
 * membuat suntingannya hilang: naskahnya tidak di-PUT (tab kolaboratif) dan
 * saat sesi tersambung lagi cermin menimpanya. Di Y.Doc sesi, suntingan itu
 * tersimpan di salinan lokalnya dan terkirim sebagai pembaruan Yjs begitu
 * tersambung. Halaman tautan berbagi tidak punya salinan lokal, jadi tidak.
 */
export function bindingOf(
	session: CollabSession | null,
	{ keepWhileInactive = false }: { keepWhileInactive?: boolean } = {},
): CollabBinding {
	if (!session || session.phase === 'gone' || session.phase === 'destroyed') return { kind: 'local' }
	const inactive = INACTIVE_PHASES.has(session.phase)
	if (inactive && !(keepWhileInactive && session.contentReady)) return { kind: 'local' }
	if (session.contentReady) {
		return {
			kind: 'live',
			doc: session.doc,
			provider: session.provider,
			user: session.user,
			readOnly: session.readOnly,
		}
	}
	// Luring dan belum pernah memegang isi tab ini di peramban ini: tetap bisa
	// menulis di salinan lokal seperti sebelum ada kolaborasi. Saat tersambung,
	// salinan itu menjadi semaian - atau dicadangkan bila tab sudah disemai
	// perangkat lain (`CollabProvider`).
	if (session.phase === 'offline') return { kind: 'local' }
	return { kind: 'pending' }
}

/**
 * Nasib salinan lokal (fragmen tab di Y.Doc besar) saat sesi tab itu PERTAMA
 * kali memegang isi di halaman ini, sebelum cermin menimpanya:
 * - `carry`: tab yang baru dibuat di server dari salinan ini (`fresh`): sesi
 *   disemai darinya, jadi suntingan sejak semaian dibawa ke Y.Doc sesi.
 * - `compare`: salinan ini mungkin memuat suntingan yang tidak pernah sampai
 *   ke room (sambungan pertama di peramban ini, atau disunting saat editor
 *   tidak terikat ke sesi) - dicadangkan bila isinya berbeda dari isi server.
 * - `none`: salinan ini hanya cermin; aman ditimpa.
 */
export function reconcileOnBind({
	fresh,
	firstBinding,
	editedLocally,
}: {
	fresh: boolean
	firstBinding: boolean
	editedLocally: boolean
}): 'carry' | 'compare' | 'none' {
	if (fresh) return 'carry'
	if (firstBinding || editedLocally) return 'compare'
	return 'none'
}

/**
 * Sisa tunda (ms) sebelum tab baru diserahkan dari salinan lokal ke sesinya.
 * Penyerahan membuat ulang editor; di tengah ketikan, beberapa ketukan jatuh
 * di antara editor lama dan yang baru. Jadi ditunggu sampai penulis berhenti
 * sejenak - tetapi tidak selamanya: selama ditunda, suntingannya belum
 * terlihat kolaborator.
 */
export function handoverDelay({
	now,
	lastEditAt,
	readySince,
	quietMs,
	maxWaitMs,
}: {
	now: number
	lastEditAt: number
	readySince: number
	quietMs: number
	maxWaitMs: number
}): number {
	const left = maxWaitMs - (now - readySince)
	if (left <= 0) return 0
	return Math.max(0, Math.min(quietMs - (now - lastEditAt), left))
}

/** Kunci pengikatan: editor dibuat ulang hanya saat kunci ini berganti. */
export function bindingKey(binding: CollabBinding): string {
	if (binding.kind !== 'live') return binding.kind
	// Kursor kolaborator butuh provider; ia ikut terpasang saat sambungan pertama ada.
	return `live:${binding.doc.guid}:${binding.provider ? 'online' : 'offline'}`
}

export function phaseOf(session: CollabSession | null): CollabPhase | null {
	return session && !INACTIVE_PHASES.has(session.phase) ? session.phase : null
}

/** Kolaborator lain yang sedang membuka tab ini, dari awareness provider-nya. */
export function useCollaborators(provider: WebsocketProvider | null): Collaborator[] {
	const [people, setPeople] = useState<Collaborator[]>([])
	useEffect(
		function followAwareness() {
			if (!provider) {
				setPeople([])
				return
			}
			const read = () => {
				const next: Collaborator[] = []
				for (const [clientId, state] of provider.awareness.getStates()) {
					if (clientId === provider.awareness.clientID) continue
					const user = state.user as { name?: unknown; color?: unknown } | undefined
					if (!user || typeof user.name !== 'string') continue
					next.push({
						clientId,
						name: user.name,
						color: typeof user.color === 'string' ? user.color : '#888888',
					})
				}
				setPeople(next)
			}
			read()
			provider.awareness.on('change', read)
			return () => provider.awareness.off('change', read)
		},
		[provider],
	)
	return people
}

/** Id acak untuk pemberitahuan dan penanda sesi kehadiran. */
export function randomId(): string {
	return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())
}
