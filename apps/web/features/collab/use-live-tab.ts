'use client'

import type { JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import type { CollabRole } from '@writer-hub/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { backupDiscardedCopy, discardedContent } from './backup'
import {
	bindingOf,
	type CollabBinding,
	type CollabNotice,
	type Collaborator,
	newNoticeId,
	phaseOf,
	useCollaborators,
} from './binding'
import { seedUpdateFromJSON } from './seed'
import { type CollabPhase, CollabSession } from './session'

export interface LiveTab {
	binding: CollabBinding
	phase: CollabPhase | null
	role: CollabRole | null
	collaborators: Collaborator[]
	notices: CollabNotice[]
	dismissNotice: (id: string) => void
}

/**
 * Satu tab yang dibuka lewat tautan berbagi, disunting/dilihat langsung.
 * Perannya mengikuti tautan (viewer hanya menerima). Tanpa salinan lokal dan
 * tanpa Y.Doc besar: halaman ini tidak punya penyimpanan dokumen sendiri.
 */
export function useLiveTab({
	serverTabId,
	shareToken,
	serverContent,
	schema,
}: {
	serverTabId: string | null
	shareToken: string
	/** Naskah server dari muatan halaman: isi semaian bila tautan ini yang diminta menyemai. */
	serverContent: JSONContent | null | undefined
	schema: Schema
}): LiveTab {
	const [session, setSession] = useState<CollabSession | null>(null)
	const [, setRevision] = useState(0)
	const [notices, setNotices] = useState<CollabNotice[]>([])
	const contentRef = useRef(serverContent)
	contentRef.current = serverContent

	useEffect(
		function openSession() {
			if (!serverTabId) {
				setSession(null)
				return
			}
			const next = new CollabSession({
				tabId: serverTabId,
				shareToken,
				seed: async () => (contentRef.current ? seedUpdateFromJSON(contentRef.current, schema) : null),
			})
			next.on('change', () => setRevision((value) => value + 1))
			next.on('discard', (discarded) => {
				const content = discardedContent(discarded, schema)
				if (!content) return
				// Tamu tautan tidak punya riwayat versi di server; salinannya disimpan
				// di peramban ini dan bisa disalin dari pemberitahuannya.
				void backupDiscardedCopy({ content, serverTabId, localTabId: null, canUseServer: false }).then(
					(result) => {
						setNotices((current) => [
							...current,
							{
								id: newNoticeId(),
								message:
									'This tab was reset by its owner (for example, a version was restored). Your previous copy is kept in this browser. Copy it now if you need it.',
								copyText: result.kind === 'server' ? undefined : result.text,
							},
						])
					},
				)
			})
			setSession(next)
			void next.start()
			return () => next.destroy()
		},
		[serverTabId, shareToken, schema],
	)

	const dismissNotice = useCallback((id: string) => {
		setNotices((current) => current.filter((notice) => notice.id !== id))
	}, [])
	const collaborators = useCollaborators(session?.provider ?? null)

	return {
		binding: bindingOf(session),
		phase: phaseOf(session),
		role: session && phaseOf(session) ? session.role : null,
		collaborators,
		notices,
		dismissNotice,
	}
}
