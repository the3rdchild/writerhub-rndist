import { useEffect, useState } from 'react'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'
import type { PresenceUser } from './presence'
import type { CollabPhase, CollabSession } from './session'

/**
 * Pengikatan editor untuk satu tab:
 * - `local`: tab belum di cloud, atau kolaborasi tidak tersedia - editor
 *   memakai salinan lokal seperti dulu.
 * - `pending`: tab cloud yang sesinya belum memegang isi (menyambung,
 *   menunggu semaian, sinkron pertama). Editor menampilkan salinan lokal
 *   HANYA-BACA: suntingan di sana akan tertimpa isi server.
 * - `live`: editor terikat ke Y.Doc sesi yang tersinkron ke semua kolaborator.
 */
export type CollabBinding =
	| { kind: 'local' }
	| { kind: 'pending' }
	| { kind: 'live'; doc: Y.Doc; provider: WebsocketProvider; user: PresenceUser; readOnly: boolean }

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

export function bindingOf(session: CollabSession | null): CollabBinding {
	if (!session || INACTIVE_PHASES.has(session.phase)) return { kind: 'local' }
	const { provider, user } = session
	if (!session.contentReady || !provider || !user) return { kind: 'pending' }
	return { kind: 'live', doc: session.doc, provider, user, readOnly: session.readOnly }
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

export function newNoticeId(): string {
	return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())
}
