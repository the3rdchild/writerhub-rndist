'use client'

import { FileDown, Printer } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSettings } from '@/features/settings/settings-context'
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

				{/* Keputusan E1: petunjuk kecil tidak cukup - langkah ini paling
				    sering terlewat dan akibatnya langsung terlihat di berkas hasil,
				    jadi pengingatnya diletakkan terakhir, persis di atas tombol. */}
				<div className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-2.5">
					<p className="text-[13px] font-semibold text-yellow-400">
						Jangan lewati langkah 2: matikan Headers and footers.
					</p>
					<p className="mt-1 text-xs leading-relaxed text-yellow-400/85">
						Chrome/Edge: <em>More settings</em> → hapus centang <em>Headers and footers</em>.
						Firefox: <em>More settings</em> → matikan <em>Print headers and footers</em>. Tanpa
						itu, URL dan tanggal ikut tercetak di sudut tiap halaman.
					</p>
				</div>

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
