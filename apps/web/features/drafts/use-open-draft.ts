'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument } from '@/features/documents/api'
import { useSync } from '@/features/sync/sync-context'
import { getDraftStatus } from './api'

/**
 * Menunggu draf dari klien eksternal selesai ditulis, lalu membukanya di
 * editor.
 *
 * Tautan yang dibalas ke pemanggil sengaja dikirim sebelum naskahnya ada -
 * itulah sebabnya halaman tujuannya menunggu di sini alih-alih langsung
 * menarik dokumen. Menariknya terlalu dini akan menyalin tab yang masih kosong
 * ke sesi lokal, dan isi yang datang belakangan tidak akan pernah menyusul ke
 * salinan itu.
 */

const POLL_INTERVAL_MS = 2_000

/** Batas tunggu; sesudah ini dokumen tetap bisa dibuka, hanya isinya belum ada. */
const MAX_WAIT_MS = 10 * 60_000

export type OpenDraftPhase = 'waiting' | 'opening' | 'error'

export interface OpenDraftState {
	phase: OpenDraftPhase
	/** Judul dokumen, begitu diketahui - dipakai supaya penantiannya tidak anonim. */
	title: string | null
	message: string | null
	/** Membuka dokumen apa adanya; dokumennya sudah ada meski naskahnya gagal ditulis. */
	openAnyway: () => void
}

export function useOpenDraft(documentId: string): OpenDraftState {
	const router = useRouter()
	const { openFromLibrary } = useSync()

	const [phase, setPhase] = useState<OpenDraftPhase>('waiting')
	const [title, setTitle] = useState<string | null>(null)
	const [message, setMessage] = useState<string | null>(null)

	const openedRef = useRef(false)

	const fail = useCallback((reason: string) => {
		setPhase('error')
		setMessage(reason)
	}, [])

	const open = useCallback(async () => {
		if (openedRef.current) return
		openedRef.current = true
		setPhase('opening')

		try {
			const detail = await getDocument(documentId)
			const tabId = await openFromLibrary(detail)
			if (!tabId) {
				openedRef.current = false
				fail('Jumlah dokumen atau tab yang terbuka sudah mencapai batas. Tutup salah satu dulu.')
				return
			}
			router.replace('/')
		} catch (cause) {
			openedRef.current = false
			fail(cause instanceof Error ? cause.message : 'Gagal membuka dokumen')
		}
	}, [documentId, fail, openFromLibrary, router])

	// Efek di bawah hanya boleh mengikuti documentId: `open` berubah identitas
	// setiap kali provider sinkronisasi menyusun ulang callback-nya, dan itu
	// akan memulai ulang penantian dari nol.
	const openRef = useRef(open)
	openRef.current = open

	useEffect(
		function waitUntilDraftIsWritten() {
			let cancelled = false
			let timer: ReturnType<typeof setTimeout> | undefined
			const deadline = Date.now() + MAX_WAIT_MS

			const check = async () => {
				try {
					const handoff = await getDraftStatus(documentId)
					if (cancelled) return
					setTitle(handoff.title)

					if (handoff.status === 'failed') {
						fail(handoff.error || 'Draf gagal ditulis. Dokumennya sudah dibuat, tapi masih kosong.')
						return
					}
					if (handoff.status === 'ready') {
						void openRef.current()
						return
					}
					if (Date.now() > deadline) {
						fail('Draf belum selesai ditulis setelah menunggu cukup lama.')
						return
					}
					timer = setTimeout(check, POLL_INTERVAL_MS)
				} catch (cause) {
					if (cancelled) return
					fail(cause instanceof Error ? cause.message : 'Gagal membaca status draf')
				}
			}

			void check()
			return () => {
				cancelled = true
				if (timer) clearTimeout(timer)
			}
		},
		[documentId, fail],
	)

	return { phase, title, message, openAnyway: () => void open() }
}
