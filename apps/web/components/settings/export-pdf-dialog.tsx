'use client'

import { FileDown, Printer } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSettings } from '@/features/settings/settings-context'

/**
 * Ekspor PDF lewat dialog cetak browser.
 *
 * Ini bukan jalan pintas - ini rute dengan hasil paling setia yang kita punya.
 * Tata letak berhalaman yang dipakai layar sudah dirancang untuk cetak: page
 * break manual jadi `break-after: page`, spacer paginasi dan lembar latar
 * disembunyikan, margin diambil dari `@page`. Browser menata ulang isinya
 * memakai aturan itu, sedangkan pustaka PDF di sisi klien menghitung tata letak
 * sendiri dan justru lebih sering merusak tabel dan pemenggalan halaman.
 *
 * Yang tidak bisa dikendalikan dari CSS adalah kepala/kaki halaman bawaan
 * browser (URL dan tanggal). Karena itu langkahnya ditulis di sini, bukan
 * dibiarkan jadi kejutan di berkas hasil.
 */
export function ExportPdfDialog() {
	const { exportOpen, setExportOpen } = useSettings()
	const overlayRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!exportOpen) return

		document.body.style.overflow = 'hidden'
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setExportOpen(false)
		}
		window.addEventListener('keydown', onKeyDown)

		return () => {
			document.body.style.overflow = ''
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [exportOpen, setExportOpen])

	if (!exportOpen) return null

	const print = () => {
		setExportOpen(false)
		// Dialog harus benar-benar hilang dari layar sebelum cetak dipanggil,
		// kalau tidak ia ikut terbawa ke halaman pertama.
		setTimeout(() => window.print(), 100)
	}

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Ekspor PDF"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setExportOpen(false)
			}}
		>
			<div className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-center gap-2">
					<FileDown className="h-5 w-5 text-accent" />
					<h2 className="text-base font-semibold text-foreground">Ekspor PDF</h2>
				</div>

				<p className="text-sm leading-relaxed text-muted">
					PDF dibuat lewat dialog cetak browser - tata letak berhalaman yang Anda lihat di layar
					dipakai apa adanya, termasuk page break dan margin.
				</p>

				<ol className="flex flex-col gap-2 rounded-xl bg-[var(--overlay-hover)] p-3 text-[13px] text-muted">
					<li className="flex gap-2">
						<span className="shrink-0 font-semibold text-accent">1.</span>
						<span>
							Pada tujuan cetak, pilih <strong className="text-foreground">Save as PDF</strong>
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 font-semibold text-accent">2.</span>
						<span>
							Buka <strong className="text-foreground">More settings</strong> lalu matikan{' '}
							<strong className="text-foreground">Headers and footers</strong> - tanpa itu, URL dan
							tanggal ikut tercetak di tiap halaman
						</span>
					</li>
					<li className="flex gap-2">
						<span className="shrink-0 font-semibold text-accent">3.</span>
						<span>
							Biarkan <strong className="text-foreground">Margins</strong> pada Default; margin
							dokumen sudah diatur dari penggaris
						</span>
					</li>
				</ol>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={() => setExportOpen(false)}
						className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="button"
						onClick={print}
						className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						<Printer className="h-4 w-4" />
						Buka dialog cetak
					</button>
				</div>
			</div>
		</div>
	)
}
