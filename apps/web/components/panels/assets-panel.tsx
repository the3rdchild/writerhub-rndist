'use client'

import { Images, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { IMAGE_ACCEPT } from '@/features/assets/types'
import {
	useActiveProjectId,
	useAssets,
	useAssetUrls,
	useDeleteAsset,
	useUploadAsset,
} from '@/features/assets/use-assets'
import { PanelEmptyState, PanelError, PanelFooter, PanelLoading, PanelScroll } from './panel-parts'

function humanSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Pustaka aset milik proyek.
 *
 * Aset dimiliki proyek dan bukan dokumen, jadi panel ini menampilkan pustaka
 * yang sama untuk setiap dokumen di proyek itu - persis alasan pustakanya ada.
 * Pratinjaunya memakai URL berumur pendek yang diterbitkan server; itu bukan
 * detail implementasi yang bocor, melainkan konsekuensi langsung dari cara
 * otorisasinya bekerja (`lib/signed-url.ts`).
 */
export function AssetsPanel() {
	const projectId = useActiveProjectId()
	const assets = useAssets(projectId)
	const upload = useUploadAsset(projectId)
	const remove = useDeleteAsset(projectId)
	const fileInput = useRef<HTMLInputElement>(null)
	const [notice, setNotice] = useState<string | null>(null)

	const ids = useMemo(() => (assets.data ?? []).map((asset) => asset.id), [assets.data])
	const urls = useAssetUrls(ids)
	const urlById = useMemo(() => new Map((urls.data ?? []).map((entry) => [entry.id, entry.url])), [urls.data])

	const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? [])
		event.target.value = ''
		if (files.length === 0) return

		setNotice(null)
		for (const file of files) {
			const result = await upload.mutateAsync(file).catch(() => null)
			if (!result) continue
			/*
			 * Dua hal yang harus diberitahukan, karena keduanya berarti berkas yang
			 * tersimpan tidak sama dengan yang dipilih pengguna - dan diam soal itu
			 * membuat orang mengira unggahannya gagal.
			 */
			if (result.deduplicated) setNotice(`${result.name} sudah ada di pustaka ini.`)
			else if (result.sanitized?.length) {
				setNotice(`${result.name}: ${result.sanitized.join(', ')} dibuang demi keamanan.`)
			}
		}
	}

	if (!projectId) {
		return (
			<PanelScroll>
				<PanelEmptyState
					icon={Images}
					title="Belum ada proyek aktif"
					description="Buka dokumen yang sudah tersimpan di server untuk melihat pustaka asetnya."
				/>
			</PanelScroll>
		)
	}

	return (
		<>
			<PanelScroll>
				{assets.isPending && <PanelLoading label="Memuat pustaka…" />}
				{assets.isError && <PanelError message={(assets.error as Error).message} />}
				{upload.isError && <PanelError message={(upload.error as Error).message} />}
				{notice && (
					<p className="rounded-xl bg-[var(--overlay-hover)] px-3 py-2 text-xs text-muted">{notice}</p>
				)}

				{!assets.isPending && !assets.isError && (assets.data?.length ?? 0) === 0 && (
					<PanelEmptyState
						icon={Images}
						title="Pustaka masih kosong"
						description="Unggah logo, foto, atau ikon yang dipakai berulang di proyek ini."
					/>
				)}

				{(assets.data?.length ?? 0) > 0 && (
					<div className="grid grid-cols-2 gap-2">
						{assets.data?.map((asset) => {
							const url = urlById.get(asset.id)
							return (
								<div
									key={asset.id}
									className="group relative overflow-hidden rounded-xl border border-line bg-surface"
								>
									<div className="flex h-24 items-center justify-center bg-[var(--overlay-hover)]">
										{url ? (
											/* biome-ignore lint/performance/noImgElement: URL aset
											   bertanda tangan dan berumur menit; mengoptimalkannya
											   lewat next/image berarti memproksikan berkas privat
											   dan menyimpannya di cache yang lebih panjang umurnya
											   daripada izin yang menerbitkannya. */
											<img src={url} alt={asset.name} className="max-h-24 max-w-full object-contain" />
										) : (
											<Images className="h-6 w-6 text-faint" />
										)}
									</div>
									<div className="px-2 py-1.5">
										<p className="truncate text-xs text-foreground" title={asset.name}>
											{asset.name}
										</p>
										<p className="text-[11px] text-faint">
											{asset.width && asset.height
												? `${asset.width}×${asset.height} · ${humanSize(asset.bytes)}`
												: humanSize(asset.bytes)}
										</p>
									</div>
									<button
										type="button"
										onClick={() => remove.mutate(asset.id)}
										aria-label={`Hapus ${asset.name}`}
										title={`Hapus ${asset.name}`}
										className="absolute right-1 top-1 rounded-md bg-surface/90 p-1 text-subtle opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							)
						})}
					</div>
				)}
			</PanelScroll>

			<PanelFooter>
				<input
					ref={fileInput}
					type="file"
					accept={IMAGE_ACCEPT}
					multiple
					className="hidden"
					onChange={onPick}
				/>
				<button
					type="button"
					onClick={() => fileInput.current?.click()}
					disabled={upload.isPending}
					className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
				>
					<Upload className="h-4 w-4" />
					{upload.isPending ? 'Mengunggah…' : 'Unggah gambar'}
				</button>
			</PanelFooter>
		</>
	)
}
