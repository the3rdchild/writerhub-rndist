'use client'

import { Trash2, Upload } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { IMAGE_ACCEPT } from '@/features/assets/types'
import { useActiveProjectId, useAssets, useAssetUrls, useUploadAsset } from '@/features/assets/use-assets'
import { useDocument } from '@/features/document/document-context'
import { pageGeometry } from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import {
	DEFAULT_WATERMARK,
	type Watermark,
	type WatermarkAnchor,
	watermarkIsEmpty,
	watermarkSizePx,
	watermarkSlots,
	watermarkTransform,
} from '@/features/editor/watermark'
import { useSessions } from '@/features/sessions/session-context'
import { cn } from '@/lib/utils'

const ANCHOR_GRID: readonly WatermarkAnchor[][] = [
	['top-left', 'top', 'top-right'],
	['left', 'center', 'right'],
	['bottom-left', 'bottom', 'bottom-right'],
]

const ANCHOR_LABELS: Record<WatermarkAnchor, string> = {
	'top-left': 'Kiri atas',
	top: 'Tengah atas',
	'top-right': 'Kanan atas',
	left: 'Kiri tengah',
	center: 'Tengah',
	right: 'Kanan tengah',
	'bottom-left': 'Kiri bawah',
	bottom: 'Tengah bawah',
	'bottom-right': 'Kanan bawah',
	tile: 'Ubin',
}

/** Seret tidak boleh membuang watermark keluar dari kotak isi sepenuhnya. */
const MAX_OFFSET = 0.45

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/**
 * Watermark halaman: gambar atau teks di bawah naskah, sama di semua halaman
 * tab ini.
 *
 * Kanvas mini di sini bukan hiasan melainkan satu-satunya tempat posisinya bisa
 * diatur - dan ia sengaja menggambar batas margin, karena batas itu nyata:
 * saat mencetak, isi halaman di-clip ke kotak margin `@page`, jadi watermark
 * yang melewatinya akan terpotong di PDF. Menyembunyikan batas itu berarti
 * membiarkan pengguna menata sesuatu yang tidak akan pernah tercetak utuh.
 */
export function WatermarkPanelBody() {
	const { setup, setPageSetup } = usePageSetup()
	const { sessions, activeId } = useSessions()
	const { state } = useDocument()
	const projectId = useActiveProjectId()
	const assets = useAssets(projectId)
	const upload = useUploadAsset(projectId)
	const fileInput = useRef<HTMLInputElement>(null)
	const boxRef = useRef<HTMLDivElement>(null)
	const [boxWidth, setBoxWidth] = useState(0)
	const [notice, setNotice] = useState<string | null>(null)

	/*
	 * Draf lokal supaya menyeret tidak menulis ke Y.Doc tiap frame: satu tulis
	 * memicu render ulang seluruh lembar naskah, dan enam puluh di antaranya per
	 * detik terasa persis seperti yang bisa dibayangkan.
	 */
	const [draft, setDraft] = useState<Watermark | null>(setup.watermark ?? null)
	const draggingRef = useRef(false)

	useEffect(
		function adoptStoredWatermark() {
			if (draggingRef.current) return
			/*
			 * Hanya nilai yang BENAR-BENAR tersimpan yang diadopsi. Mengosongkan
			 * kolom teks membuat nilai tersimpannya lenyap - memang benar, watermark
			 * tanpa teks tidak menggambar apa pun - tapi kalau draf ikut dikosongkan,
			 * ukuran, opasitas, dan rotasi yang sudah disetel ikut hilang hanya
			 * karena penulisnya hendak mengganti katanya.
			 */
			if (setup.watermark) setDraft(setup.watermark)
		},
		[setup.watermark],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: sengaja hanya bereaksi pada pergantian tab - nilai tersimpannya diurus efek di atas
	useEffect(
		function reloadOnTabChange() {
			/* Tab lain punya watermarknya sendiri - termasuk "tidak punya". */
			setDraft(setup.watermark ?? null)
		},
		[activeId],
	)

	const geometry = useMemo(() => pageGeometry(setup), [setup])
	const assetIds = useMemo(() => (assets.data ?? []).map((asset) => asset.id), [assets.data])
	const urls = useAssetUrls(assetIds)
	const urlById = useMemo(() => new Map((urls.data ?? []).map((entry) => [entry.id, entry.url])), [urls.data])

	useEffect(function trackPreviewWidth() {
		const node = boxRef.current
		if (!node) return
		const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width))
		observer.observe(node)
		setBoxWidth(node.getBoundingClientRect().width)
		return () => observer.disconnect()
	}, [])

	const scopeLabel =
		sessions.find((tab) => tab.id === activeId)?.title || state.title || 'Dokumen tanpa judul'

	const write = (next: Watermark | null) => {
		setDraft(next)
		if (next === null) {
			const { watermark: _removed, ...rest } = setup
			setPageSetup(rest, 'tab')
			return
		}
		setPageSetup({ ...setup, watermark: next }, 'tab')
	}

	const patch = (change: Partial<Watermark>) => write({ ...(draft ?? DEFAULT_WATERMARK), ...change })

	const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
		const current = draft
		if (!current || current.anchor === 'tile' || boxWidth === 0) return
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		draggingRef.current = true

		const boxHeight = boxWidth * (geometry.contentHeight / geometry.contentWidth)
		const startX = event.clientX
		const startY = event.clientY
		const from = { x: current.offsetX, y: current.offsetY }
		let latest = current

		const move = (moveEvent: PointerEvent) => {
			latest = {
				...current,
				offsetX: clamp(from.x + (moveEvent.clientX - startX) / boxWidth, -MAX_OFFSET, MAX_OFFSET),
				offsetY: clamp(from.y + (moveEvent.clientY - startY) / boxHeight, -MAX_OFFSET, MAX_OFFSET),
			}
			setDraft(latest)
		}
		const end = () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', end)
			draggingRef.current = false
			write(latest)
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', end)
	}

	const pickFile = async (file: File | undefined) => {
		if (!file) return
		if (!projectId) {
			setNotice('Dokumen ini belum tersinkron ke proyek, jadi belum ada pustaka aset untuk menyimpannya.')
			return
		}
		setNotice(null)
		try {
			const asset = await upload.mutateAsync(file)
			patch({ kind: 'image', assetId: asset.id })
		} catch (error) {
			setNotice(error instanceof Error ? error.message : 'Unggahan gagal.')
		}
	}

	const active = draft
	const previewScale = boxWidth > 0 ? boxWidth / geometry.contentWidth : 0
	const marginPercent = {
		top: `${(geometry.margins.top / geometry.height) * 100}%`,
		right: `${(geometry.margins.right / geometry.width) * 100}%`,
		bottom: `${(geometry.margins.bottom / geometry.height) * 100}%`,
		left: `${(geometry.margins.left / geometry.width) * 100}%`,
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface-inset p-4">
			<div className="flex gap-2">
				{(
					[
						{ kind: 'text' as const, label: 'Teks' },
						{ kind: 'image' as const, label: 'Gambar' },
					] satisfies ReadonlyArray<{ kind: Watermark['kind']; label: string }>
				).map((option) => (
					<button
						key={option.kind}
						type="button"
						onClick={() => patch({ kind: option.kind })}
						className={cn(
							'flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors',
							(active?.kind ?? 'text') === option.kind
								? 'border-accent bg-accent/10 text-accent'
								: 'border-line text-muted hover:text-foreground',
						)}
					>
						{option.label}
					</button>
				))}
			</div>

			{(active?.kind ?? 'text') === 'text' ? (
				<input
					type="text"
					value={active?.text ?? ''}
					onChange={(event) => patch({ kind: 'text', text: event.target.value })}
					placeholder={DEFAULT_WATERMARK.text}
					aria-label="Teks watermark"
					className="w-full rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-foreground text-sm outline-none transition-colors focus:border-accent"
				/>
			) : (
				<div className="flex flex-col gap-2">
					<div className="grid grid-cols-4 gap-1.5">
						{(assets.data ?? []).map((asset) => {
							const url = urlById.get(asset.id)
							return (
								<button
									key={asset.id}
									type="button"
									title={asset.name}
									onClick={() => patch({ kind: 'image', assetId: asset.id })}
									className={cn(
										'aspect-square overflow-hidden rounded-md border bg-surface-raised transition-colors',
										active?.assetId === asset.id
											? 'border-accent ring-1 ring-accent'
											: 'border-line hover:border-line-strong',
									)}
								>
									{url && (
										/* biome-ignore lint/performance/noImgElement: URL aset bertanda
										   tangan dan berumur menit - alasan yang sama dengan panel Aset. */
										<img src={url} alt="" className="h-full w-full object-contain" />
									)}
								</button>
							)
						})}
					</div>
					{projectId !== null && (assets.data ?? []).length === 0 && !assets.isLoading && (
						<p className="text-[11px] text-subtle">
							Pustaka aset proyek ini masih kosong. Unggah gambarnya di sini - ia ikut tersimpan di pustaka,
							jadi dokumen lain di proyek yang sama bisa memakai logo yang sama.
						</p>
					)}
					<button
						type="button"
						onClick={() => fileInput.current?.click()}
						disabled={upload.isPending}
						className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-muted text-xs transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:opacity-50"
					>
						<Upload className="h-3.5 w-3.5" />
						{upload.isPending ? 'Mengunggah…' : 'Unggah gambar'}
					</button>
					<input
						ref={fileInput}
						type="file"
						accept={IMAGE_ACCEPT}
						hidden
						onChange={(event) => {
							void pickFile(event.target.files?.[0])
							event.target.value = ''
						}}
					/>
				</div>
			)}

			{notice && <p className="text-[11px] text-red-400">{notice}</p>}

			{/* Kanvas mini: kertas, batas margin, dan watermarknya - dengan matematika
			    penempatan yang sama persis dengan yang dipakai kertas sungguhan. */}
			<div
				className="relative w-full overflow-hidden rounded-lg border border-line bg-white"
				style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }}
			>
				<div ref={boxRef} className="absolute border border-line border-dashed" style={marginPercent}>
					{active &&
						!watermarkIsEmpty(active) &&
						previewScale > 0 &&
						watermarkSlots(active).map((slot) => {
							const size = watermarkSizePx(active, geometry) * previewScale
							const style = {
								left: `${slot.left * 100}%`,
								top: `${slot.top * 100}%`,
								transform: watermarkTransform(slot, active),
								opacity: active.opacity,
							}
							const key = `${slot.left}:${slot.top}`
							const isDraggable = active.anchor !== 'tile'

							if (active.kind === 'image') {
								const url = active.assetId ? urlById.get(active.assetId) : undefined
								if (!url) return null
								return (
									/* Seret tetikus murni; padanan papan tiknya adalah kisi jangkar
									   sembilan tombol di bawah kanvas ini. */
									// biome-ignore lint/performance/noImgElement: URL aset bertanda tangan berumur menit - sama seperti panel Aset.
									<img
										key={key}
										src={url}
										alt=""
										draggable={false}
										onPointerDown={isDraggable ? startDrag : undefined}
										className={cn('absolute select-none', isDraggable && 'cursor-move')}
										style={{ ...style, width: size }}
									/>
								)
							}

							return (
								/* Seret tetikus murni; padanan papan tiknya adalah kisi jangkar
								   sembilan tombol di bawah kanvas ini. */
								<span
									key={key}
									onPointerDown={isDraggable ? startDrag : undefined}
									className={cn(
										'absolute select-none whitespace-nowrap font-bold leading-none text-[#111827]',
										isDraggable && 'cursor-move',
									)}
									style={{
										...style,
										fontSize: Math.max(4, size / Math.max(2, (active.text ?? '').trim().length * 0.58)),
									}}
								>
									{active.text}
								</span>
							)
						})}
				</div>
			</div>
			<p className="text-[11px] text-subtle">
				Garis putus-putus adalah batas margin. Saat mencetak, isi di luarnya dipotong - jadi watermark pun
				berhenti di situ.
			</p>

			<div className="flex items-start gap-3">
				<div className="grid shrink-0 grid-cols-3 gap-0.5">
					{ANCHOR_GRID.flatMap((row) =>
						row.map((anchor) => (
							<button
								key={anchor}
								type="button"
								title={ANCHOR_LABELS[anchor]}
								aria-label={ANCHOR_LABELS[anchor]}
								aria-pressed={active?.anchor === anchor}
								onClick={() => patch({ anchor, offsetX: 0, offsetY: 0 })}
								className={cn(
									'h-6 w-6 rounded border transition-colors',
									active?.anchor === anchor
										? 'border-accent bg-accent/20'
										: 'border-line bg-surface-raised hover:border-line-strong',
								)}
							/>
						)),
					)}
				</div>
				<button
					type="button"
					onClick={() => patch({ anchor: 'tile', offsetX: 0, offsetY: 0 })}
					className={cn(
						'rounded-lg border px-3 py-1.5 text-xs transition-colors',
						active?.anchor === 'tile'
							? 'border-accent bg-accent/10 text-accent'
							: 'border-line text-muted hover:text-foreground',
					)}
				>
					Ubin
				</button>
			</div>

			<Slider
				label="Ukuran"
				value={Math.round((active?.scale ?? DEFAULT_WATERMARK.scale) * 100)}
				min={5}
				max={100}
				suffix="%"
				onInput={(value) => setDraft({ ...(draft ?? DEFAULT_WATERMARK), scale: value / 100 })}
				onCommit={(value) => patch({ scale: value / 100 })}
			/>
			<Slider
				label="Opasitas"
				value={Math.round((active?.opacity ?? DEFAULT_WATERMARK.opacity) * 100)}
				min={2}
				max={100}
				suffix="%"
				onInput={(value) => setDraft({ ...(draft ?? DEFAULT_WATERMARK), opacity: value / 100 })}
				onCommit={(value) => patch({ opacity: value / 100 })}
			/>
			<Slider
				label="Rotasi"
				value={Math.round(active?.rotation ?? DEFAULT_WATERMARK.rotation)}
				min={-90}
				max={90}
				suffix="°"
				onInput={(value) => setDraft({ ...(draft ?? DEFAULT_WATERMARK), rotation: value })}
				onCommit={(value) => patch({ rotation: value })}
			/>

			<p className="truncate text-[11px] text-subtle" title={scopeLabel}>
				Tab ini: {scopeLabel}
			</p>

			{active && (
				<button
					type="button"
					onClick={() => write(null)}
					className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-muted text-xs transition-colors hover:bg-red-500/10 hover:text-red-400"
				>
					<Trash2 className="h-3.5 w-3.5" />
					Hapus watermark
				</button>
			)}
		</div>
	)
}

function Slider({
	label,
	value,
	min,
	max,
	suffix,
	onInput,
	onCommit,
}: {
	label: string
	value: number
	min: number
	max: number
	suffix: string
	onInput: (value: number) => void
	onCommit: (value: number) => void
}) {
	return (
		<label className="flex items-center gap-2">
			<span className="w-16 shrink-0 text-muted text-xs">{label}</span>
			<input
				type="range"
				min={min}
				max={max}
				value={value}
				onChange={(event) => onInput(Number(event.target.value))}
				/* Ditulis ke dokumen saat jari diangkat, bukan tiap frame: satu tulis
				   memicu render ulang seluruh lembar naskah. */
				onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
				onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
				className="min-w-0 flex-1 accent-[var(--accent)]"
			/>
			<span className="w-10 shrink-0 text-right text-[11px] text-subtle tabular-nums">
				{value}
				{suffix}
			</span>
		</label>
	)
}
