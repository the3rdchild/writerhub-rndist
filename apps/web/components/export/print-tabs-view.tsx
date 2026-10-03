'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { EXPORT_READY_ATTRIBUTE, type ExportPayload } from '@/features/export/types'
import { ExportDocumentView } from './export-document-view'

/** Batas tunggu paginasi tenang sebelum tetap mencetak apa adanya. */
const READY_TIMEOUT_MS = 30_000
export const PRINTING_TABS_CLASS = 'printing-tabs'

/**
 * Cetak beberapa tab sekaligus (SHL-19). Kanvas hanya merender tab aktif, jadi
 * tab-tab pilihan dirender di luar layar dengan tampilan ekspor yang sama
 * dengan perender berkas - satu aliran, tiap tab mulai di halaman baru - lalu
 * dialog cetak dibuka begitu paginasinya tenang. Selama mencetak, naskah tab
 * aktif disembunyikan dari kertas (`printing-tabs` di globals.css).
 */
export function PrintTabsView({ payload, onDone }: { payload: ExportPayload; onDone: () => void }) {
	useEffect(
		function printWhenReady() {
			document.body.classList.add(PRINTING_TABS_CLASS)
			const started = Date.now()
			let timer: ReturnType<typeof setTimeout> | null = null
			const finish = () => {
				document.body.classList.remove(PRINTING_TABS_CLASS)
				onDone()
			}
			const poll = () => {
				const ready = document.body.hasAttribute(EXPORT_READY_ATTRIBUTE)
				if (!ready && Date.now() - started < READY_TIMEOUT_MS) {
					timer = setTimeout(poll, 100)
					return
				}
				window.addEventListener('afterprint', finish, { once: true })
				window.print()
			}
			timer = setTimeout(poll, 100)
			return () => {
				if (timer) clearTimeout(timer)
				window.removeEventListener('afterprint', finish)
				document.body.classList.remove(PRINTING_TABS_CLASS)
			}
		},
		[onDone],
	)

	return createPortal(
		<div className="print-tabs-root" aria-hidden="true">
			<ExportDocumentView payload={payload} />
		</div>,
		document.body,
	)
}
