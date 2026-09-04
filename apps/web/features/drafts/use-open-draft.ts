'use client'

import type { DraftErrorCode, DraftProgress, DraftStatus } from '@writer-hub/shared'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument } from '@/features/documents/api'
import { useSync } from '@/features/sync/sync-context'
import { getDraftStatus, retryDraft } from './api'

/**
 * Menunggu draf dari klien eksternal selesai ditulis, lalu membukanya di
 * editor.
 *
 * Tautan yang dibalas ke pemanggil sengaja dikirim sebelum naskahnya ada -
 * itulah sebabnya halaman tujuannya menunggu di sini alih-alih langsung
 * menarik dokumen. Menariknya terlalu dini akan menyalin tab yang masih kosong
 * ke sesi lokal, dan isi yang datang belakangan tidak akan pernah menyusul ke
 * salinan itu.
 *
 * Penantiannya tidak pernah buntu: setiap kali status dibaca, ia berakhir
 * sebagai kemajuan yang bertambah, dokumen yang dibuka, atau kegagalan yang
 * bisa ditindaklanjuti - tidak ada jalur yang berhenti tanpa mengabari.
 */

const POLL_INTERVAL_MS = 2_000

/** Batas tunggu di sisi ini; API punya tenggatnya sendiri yang lebih pendek. */
const MAX_WAIT_MS = 10 * 60_000

/**
 * Status yang berarti naskahnya sudah tersimpan - dan hanya itu yang ditunggu
 * di sini.
 *
 * `queued` dan `rendering` menggambarkan pekerjaan **sesudah** naskahnya jadi:
 * mengubah dokumen menjadi berkas untuk pemanggil eksternal
 * (docs/RENDER-WORKER-PLAN.md §2). Dokumennya sendiri sudah utuh. Menunggu
 * sampai `ready` berarti menahan penulisnya di layar tunggu demi berkas yang
 * bukan ia yang meminta - dan karena `progress` hanya terisi selama
 * `generating`, yang ia lihat adalah bilah yang kembali ke 0%.
 */
const WRITTEN: readonly DraftStatus[] = ['ready', 'queued', 'rendering']

export type OpenDraftPhase = 'waiting' | 'opening' | 'error'

export interface OpenDraftState {
	phase: OpenDraftPhase
	/** Judul dokumen, begitu diketahui - dipakai supaya penantiannya tidak anonim. */
	title: string | null
	message: string | null
	/** Sebab kegagalan dari API; null untuk kendala yang muncul di sisi peramban. */
	errorCode: DraftErrorCode | null
	/** Kemajuan penulisan selama masih menunggu. */
	progress: DraftProgress | null
	/** Percobaan ulang hanya mungkin untuk draf yang gagal ditulis di sisi API. */
	canRetry: boolean
	retrying: boolean
	retry: () => void
	/** Membuka dokumen apa adanya; dokumennya sudah ada meski naskahnya gagal ditulis. */
	openAnyway: () => void
}

export function useOpenDraft(documentId: string): OpenDraftState {
	const router = useRouter()
	const { openFromLibrary } = useSync()

	const [phase, setPhase] = useState<OpenDraftPhase>('waiting')
	const [title, setTitle] = useState<string | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const [errorCode, setErrorCode] = useState<DraftErrorCode | null>(null)
	const [progress, setProgress] = useState<DraftProgress | null>(null)
	const [retrying, setRetrying] = useState(false)

	const openedRef = useRef(false)
	const stoppedRef = useRef(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	const fail = useCallback((reason: string, code: DraftErrorCode | null) => {
		setPhase('error')
		setMessage(reason)
		setErrorCode(code)
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
				fail('Jumlah dokumen atau tab yang terbuka sudah mencapai batas. Tutup salah satu dulu.', null)
				return
			}
			router.replace('/')
		} catch (cause) {
			openedRef.current = false
			fail(cause instanceof Error ? cause.message : 'Gagal membuka dokumen', null)
		}
	}, [documentId, fail, openFromLibrary, router])

	// `open` berubah identitas setiap kali provider sinkronisasi menyusun ulang
	// callback-nya. Lewat ref, penantian di bawah tidak ikut dimulai ulang
	// karenanya - satu-satunya yang boleh memulainya ulang adalah dokumen yang
	// berbeda atau percobaan ulang yang diminta pengguna.
	const openRef = useRef(open)
	openRef.current = open

	const poll = useCallback(
		async function waitUntilDraftIsWritten(deadline: number): Promise<void> {
			try {
				const handoff = await getDraftStatus(documentId)
				if (stoppedRef.current) return

				setTitle(handoff.title)
				setProgress(handoff.progress ?? null)

				if (handoff.status === 'failed') {
					fail(
						handoff.error || 'Draf gagal ditulis. Dokumennya sudah dibuat, tapi masih kosong.',
						handoff.errorCode ?? 'unknown',
					)
					return
				}
				if (WRITTEN.includes(handoff.status)) {
					void openRef.current()
					return
				}
				if (Date.now() > deadline) {
					fail('Draf belum selesai ditulis setelah menunggu cukup lama.', 'timeout')
					return
				}

				timerRef.current = setTimeout(() => void waitUntilDraftIsWritten(deadline), POLL_INTERVAL_MS)
			} catch (cause) {
				if (stoppedRef.current) return
				fail(cause instanceof Error ? cause.message : 'Gagal membaca status draf', null)
			}
		},
		[documentId, fail],
	)

	useEffect(
		function startWaiting() {
			stoppedRef.current = false
			void poll(Date.now() + MAX_WAIT_MS)

			return () => {
				stoppedRef.current = true
				if (timerRef.current) clearTimeout(timerRef.current)
			}
		},
		[poll],
	)

	const retry = useCallback(() => {
		setRetrying(true)
		retryDraft(documentId)
			.then(() => {
				setPhase('waiting')
				setMessage(null)
				setErrorCode(null)
				void poll(Date.now() + MAX_WAIT_MS)
			})
			.catch((cause) => fail(cause instanceof Error ? cause.message : 'Gagal mencoba menulis ulang', null))
			.finally(() => setRetrying(false))
	}, [documentId, fail, poll])

	return {
		phase,
		title,
		message,
		errorCode,
		progress,
		canRetry: errorCode !== null,
		retrying,
		retry,
		openAnyway: () => void open(),
	}
}
