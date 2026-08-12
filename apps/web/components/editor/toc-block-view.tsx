'use client'

import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Copy, MoreVertical, RefreshCw, Settings2, Trash2, Type } from 'lucide-react'
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OutlineItem } from '@/features/editor/use-outline-plain'
import { readOutlineItems } from '@/features/editor/use-outline-plain'
import { pageGeometry } from '@/features/editor/page-geometry'
import { paginationKey, SELF_PAGINATE_ATTRIBUTE, SPACER_ATTRIBUTE } from '@/features/editor/pagination'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'
import {
	DEFAULT_TOC_ATTRS,
	type TocBlockAttrs,
	type TocListKind,
	type TocTabLeader,
	TOC_BLOCK,
} from '@/features/editor/toc-block'

/**
 * NodeView blok daftar isi.
 *
 * Isi DIHASILKAN dari kerangka dokumen (sumber yang sama dengan sidebar) dan
 * dibekukan di state lokal: mengubah judul TIDAK mengubah blok sampai pengguna
 * menekan Segarkan, mencetak, atau mengekspor (kriteria §A5.5 no. 2). Node
 * sendiri hanya pegang atribut + snapshot teks terakhir untuk cetak/ekspor.
 *
 * Blok ini memenggal dirinya sendiri (data-self-paginate, lihat pagination.ts):
 * celah sebesar jarak antar lembar disisipkan di antara entri tepat pada batas
 * lembar, dan tiap segmen lembar dibingkai kotaknya sendiri - seperti daftar
 * isi Google Docs yang berlanjut di halaman berikutnya.
 */

/** Satu baris daftar: item kerangka + nomor halaman hasil potret terakhir. */
interface TocEntry {
	item: OutlineItem
	page?: number
}

/** Celah internal sebelum entri ke-`before`, setinggi jarak antar lembar. */
interface TocGap {
	before: number
	height: number
}

const KIND_FILTER: Record<TocListKind, 'heading' | 'caption'> = {
	isi: 'heading',
	gambar: 'caption',
	tabel: 'caption',
}

const KIND_TITLE: Record<TocListKind, string> = {
	isi: 'Daftar isi',
	gambar: 'Daftar gambar',
	tabel: 'Daftar tabel',
}

const EMPTY_HINT: Record<TocListKind, string> = {
	isi: 'Belum ada judul di rentang tingkat ini.',
	gambar: 'Belum ada caption gambar (heading tingkat 7-9).',
	tabel: 'Belum ada caption tabel (heading tingkat 7-9).',
}

/** Karakter pengisi tab sesuai `tabLeader`. */
function leaderChar(tabLeader: TocTabLeader): string {
	switch (tabLeader) {
		case 'dots':
			return '·'
		case 'dashes':
			return '-'
		case 'line':
			return '_'
		default:
			return ' '
	}
}

/** Id jangkar heading untuk butir bergaya Tautan (diset ulang tiap Segarkan). */
function tocAnchorId(pos: number): string {
	return `toc-h-${pos}`
}

export function TocBlockView({ node, editor, getPos, selected, updateAttributes, deleteNode }: NodeViewProps) {
	// Atribut node; jatuh ke bawaan untuk atribut yang belum ada (dokumen lama).
	const attrs: TocBlockAttrs = {
		...DEFAULT_TOC_ATTRS,
		...(node.attrs as Partial<TocBlockAttrs>),
	}

	// Isi blok: beku di antara dua penyegaran (§A5.3).
	const [entries, setEntries] = useState<TocEntry[]>([])

	// `attrs` dibentuk ulang tiap render, jadi refresh membaca lewat ref supaya
	// identitasnya stabil - kalau tidak, efek [refresh] di bawah memicu render
	// tanpa henti (refresh → setEntries → render → refresh baru).
	const attrsRef = useRef(attrs)
	attrsRef.current = attrs

	const refresh = useCallback(() => {
		const attrs = attrsRef.current
		const lo = Math.min(attrs.minLevel, attrs.maxLevel)
		const hi = Math.max(attrs.minLevel, attrs.maxLevel)
		const wantKind = KIND_FILTER[attrs.listKind]
		const items = readOutlineItems(editor.state.doc).filter(
			(item) => item.kind === wantKind && item.level >= lo && item.level <= hi,
		)

		// pageStride dari keadaan plugin paginasi aktif (akurat per-dokumen),
		// bukan geometri bawaan. Nomor halaman = offsetTop heading / stride + 1.
		const state = paginationKey.getState(editor.state)
		const stride = state?.geometry?.pageStride ?? pageGeometry().pageStride
		const next: TocEntry[] = items.map((item) => {
			let page: number | undefined
			if (item.pos + 1 <= editor.state.doc.content.size) {
				try {
					// nodeDOM memberi elemen heading itu sendiri - lebih pasti daripada
					// menebak lewat domAtPos(pos + 1).
					const el = editor.view.nodeDOM(item.pos)
					if (el instanceof HTMLElement) {
						if (attrs.showPageNumbers) page = Math.floor(el.offsetTop / stride) + 1
						// Gaya Tautan: beri id supaya <a href="#..."> ikut berfungsi di
						// PDF hasil cetak (§A5.5 no. 4). Ids diset ulang tiap Segarkan.
						if (attrs.style === 'link') el.id = tocAnchorId(item.pos)
					}
				} catch {
					// Posisi basi saat dokumen sedang berubah - baris ini tanpa nomor.
				}
			}
			return { item, page }
		})
		setEntries(next)

		// Snapshot teks untuk cetak/ekspor (§A5.2: node simpan potret terakhir).
		// Hanya ditulis bila berubah - penyegaran dipicu juga oleh beforeprint,
		// dan transaksi kosong tiap cetak itu sia-sia.
		const snapshot = snapshotText(next, attrs)
		if (snapshot !== attrs.snapshot) updateAttributes({ snapshot })
	}, [editor, updateAttributes])

	// Potret awal saat blok muncul + hitung ulang bila setelan yang memengaruhi
	// isi berubah lewat dialog. Dokumen sengaja BUKAN dependensi (§A5.5 no. 2).
	const minLevel = attrs.minLevel
	const maxLevel = attrs.maxLevel
	const listKind = attrs.listKind
	const showPageNumbers = attrs.showPageNumbers
	const style = attrs.style
	useEffect(() => {
		refresh()
	}, [refresh, minLevel, maxLevel, listKind, showPageNumbers, style])

	// Segarkan saat mencetak (§A5.3) dan saat diminta dari luar (ekspor DOCX).
	useEffect(() => {
		const dom = editor.view.dom
		window.addEventListener('beforeprint', refresh)
		dom.addEventListener(TOC_REFRESH_EVENT, refresh)
		return () => {
			window.removeEventListener('beforeprint', refresh)
			dom.removeEventListener(TOC_REFRESH_EVENT, refresh)
		}
	}, [editor, refresh])

	/** Ganti blok dengan paragraf teks biasa berisi potret terakhir. */
	const convertToText = () => {
		const pos = getPos()
		if (pos === undefined) return
		const paragraphs = entries.map(({ item, page }) => {
			const text = attrs.showPageNumbers && page !== undefined ? `${item.text}\t${page}` : item.text
			return { type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }
		})
		editor
			.chain()
			.focus()
			.insertContentAt({ from: pos, to: pos + node.nodeSize }, paragraphs.length ? paragraphs : [{ type: 'paragraph' }])
			.run()
	}

	/** Lompat ke heading - dipakai butir bergaya Tautan (§A5.5 no. 4). */
	const jumpTo = (pos: number) => {
		editor.chain().focus().setTextSelection(Math.min(pos + 1, editor.state.doc.content.size)).scrollIntoView().run()
	}

	// ── Pemenggalan diri sendiri (self-paginate) ────────────────────────────
	const [gaps, setGaps] = useState<TocGap[]>([])
	const [pageTick, setPageTick] = useState(0)

	// Celah internal bergantung pada spacer yang mendahului blok; pasang ulang
	// tiap keadaan paginasi berubah (spacer, geometri, atau mode pageless).
	useEffect(() => {
		let last = paginationKey.getState(editor.state)
		const onTransaction = () => {
			const current = paginationKey.getState(editor.state)
			if (!current || !last) {
				last = current
				return
			}
			if (
				current.spacers !== last.spacers ||
				current.geometry !== last.geometry ||
				current.pageless !== last.pageless
			) {
				last = current
				setPageTick((t) => t + 1)
			}
		}
		editor.on('transaction', onTransaction)
		return () => {
			editor.off('transaction', onTransaction)
		}
	}, [editor])

	// Sisipkan celah tepat sebelum entri yang melanggar bawah area teks lembar.
	// Sasaran celah bersifat absolut (kelipatan pageStride), jadi perhitungan
	// ulang atas keadaan yang sama menghasilkan celah identik - loop berhenti.
	useLayoutEffect(() => {
		const pos = getPos()
		const wrapper = pos === undefined ? null : editor.view.nodeDOM(pos)
		if (!(wrapper instanceof HTMLElement)) return
		const state = paginationKey.getState(editor.state)
		if (!state || state.pageless) {
			if (gaps.length > 0) setGaps([])
			return
		}
		const { contentHeight, pageStride } = state.geometry
		const lis = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-toc-entry]'))
		const base = wrapper.offsetTop

		// offsetTop li mencerminkan celah yang sedang terpasang; pulihkan posisi
		// alaminya dengan mengurangi celah yang mendahuluinya.
		const next: TocGap[] = []
		let gapIndex = 0
		let shift = 0
		for (let i = 0; i < lis.length; i++) {
			let natural = lis[i].offsetTop
			while (gapIndex < gaps.length && gaps[gapIndex].before <= i) {
				natural -= gaps[gapIndex].height
				gapIndex++
			}
			const top = base + natural + shift
			const bottom = top + lis[i].offsetHeight
			const sheet = Math.floor(top / pageStride)
			if (bottom > sheet * pageStride + contentHeight + 0.5) {
				// Entri melanggar bawah area teks: dorong ke puncak lembar berikutnya.
				const height = (sheet + 1) * pageStride - top
				next.push({ before: i, height })
				shift += height
			}
		}

		const same =
			gaps.length === next.length &&
			gaps.every((gap, i) => gap.before === next[i].before && Math.abs(gap.height - next[i].height) < 1)
		if (!same) setGaps(next)
	})

	// Kelompokkan entri per lembar: tiap segmen dibingkai kotaknya sendiri.
	const segments: { entries: TocEntry[]; gapAfter?: number }[] = []
	{
		let current: TocEntry[] = []
		let gapIndex = 0
		entries.forEach((entry, i) => {
			if (gapIndex < gaps.length && gaps[gapIndex].before === i) {
				segments.push({ entries: current, gapAfter: gaps[gapIndex].height })
				current = []
				gapIndex++
			}
			current.push(entry)
		})
		segments.push({ entries: current })
	}

	return (
		<NodeViewWrapper
			className="toc-block-wrapper relative my-3"
			data-type={TOC_BLOCK}
			{...{ [SELF_PAGINATE_ATTRIBUTE]: 'true' }}
		>
			{segments.map((segment, segmentIndex) => (
				<Fragment key={segmentIndex}>
					{/* Segmen kosong hanya mungkin di lembar pertama (seluruh entri tak
					    muat di sisa lembar) - kotaknya tetap digambar agar bilah kontrol
					    punya tempat. */}
					{(segment.entries.length > 0 || segmentIndex === 0) && (
						<div
							className={cn(
								'toc-segment rounded-lg border p-4',
								selected ? 'border-accent bg-surface-inset/60' : 'border-line bg-surface-inset/40',
							)}
						>
							{segmentIndex === 0 && (
								<TocControls
									attrs={attrs}
									selected={selected}
									onRefresh={refresh}
									onSettings={() => openTocSettings(editor.view.dom, attrs, updateAttributes)}
									onCopy={() => copyAsText(entries, attrs)}
									onConvert={convertToText}
									onDelete={deleteNode}
								/>
							)}
							<TocEntries entries={segment.entries} attrs={attrs} onJump={jumpTo} />
							{entries.length === 0 && (
								<p className="py-2 text-center text-xs italic text-subtle">{EMPTY_HINT[attrs.listKind]}</p>
							)}
						</div>
					)}
					{segment.gapAfter !== undefined && (
						<div
							aria-hidden
							className="toc-page-gap"
							style={{ height: `${segment.gapAfter}px` }}
							{...{ [SPACER_ATTRIBUTE]: String(getPos() ?? 0) }}
						/>
					)}
				</Fragment>
			))}
		</NodeViewWrapper>
	)
}

/** Bilah kontrol: tampil saat blok dipilih atau di-hover. */
function TocControls({
	attrs,
	selected,
	onRefresh,
	onSettings,
	onCopy,
	onConvert,
	onDelete,
}: {
	attrs: TocBlockAttrs
	selected: boolean
	onRefresh: () => void
	onSettings: () => void
	onCopy: () => void
	onConvert: () => void
	onDelete: () => void
}) {
	return (
		/*
		 * Bilah ini chrome editor, bukan isi naskah: tipografinya dicabut dari
		 * warisan dokumen lewat .toc-block-controls di globals.css - yang juga
		 * menyembunyikannya saat mencetak.
		 */
		<div
			className={cn(
				'toc-block-controls mb-2 flex items-center gap-1 transition-opacity',
				selected ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 hover:opacity-100',
			)}
		>
			<span className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-subtle">
				{KIND_TITLE[attrs.listKind]}
			</span>
			<button
				type="button"
				onClick={onRefresh}
				title="Segarkan isi dan nomor halaman"
				className="rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<RefreshCw className="h-3.5 w-3.5" />
			</button>
			{/*
			 * Rata kanan: tombolnya duduk di tepi kanan kotak TOC, jadi panel yang
			 * dibentang ke kanan (bawaan `start`) tumpah keluar lembar kertas.
			 */}
			<Dropdown
				align="end"
				trigger={({ open, toggle }) => (
					<button
						type="button"
						onClick={toggle}
						title="Opsi"
						aria-label="Opsi daftar isi"
						className={cn(
							'rounded-md p-1.5 transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground',
							open ? 'bg-[var(--overlay-active)] text-foreground' : 'text-subtle',
						)}
					>
						<MoreVertical className="h-3.5 w-3.5" />
					</button>
				)}
			>
				{({ close }) => (
					<>
						{/*
						 * Ikon lewat prop `icon`, bukan di dalam `children`: preflight
						 * Tailwind memberi `svg { display: block }`, jadi ikon yang duduk
						 * di sebelah teks label memaksa barisnya sendiri dan seluruh menu
						 * tampak bertumpuk.
						 */}
						<DropdownItem icon={<Settings2 className="h-3.5 w-3.5" />} onSelect={() => { close(); onSettings() }}>
							Setelan daftar isi…
						</DropdownItem>
						<DropdownItem icon={<Copy className="h-3.5 w-3.5" />} onSelect={() => { close(); onCopy() }}>
							Salin sebagai teks
						</DropdownItem>
						<DropdownItem icon={<Type className="h-3.5 w-3.5" />} onSelect={() => { close(); onConvert() }}>
							Ubah jadi teks biasa
						</DropdownItem>
						<DropdownSeparator />
						<DropdownItem icon={<Trash2 className="h-3.5 w-3.5" />} onSelect={() => { close(); onDelete() }}>
							Hapus
						</DropdownItem>
					</>
				)}
			</Dropdown>
		</div>
	)
}

function TocEntries({
	entries,
	attrs,
	onJump,
}: {
	entries: TocEntry[]
	attrs: TocBlockAttrs
	onJump: (pos: number) => void
}) {
	if (entries.length === 0) return null

	const lo = Math.min(attrs.minLevel, attrs.maxLevel)

	return (
		<ul className="flex flex-col gap-0.5">
			{entries.map(({ item, page }) => {
				const indent = (item.level - lo) * attrs.indentPerLevel
				const showPage = attrs.showPageNumbers && page !== undefined
				return (
					<li
						key={item.pos}
						data-toc-entry
						style={{ paddingLeft: `${indent}px` }}
						className={cn(
							'flex items-baseline gap-2 text-sm',
							attrs.style === 'link' && 'text-accent underline-offset-2 hover:underline',
						)}
					>
						{/* Judul apa adanya (nomor bab dibakar di teksnya, putusan A5).
						    Gaya Tautan memakai <a> sungguhan supaya tautan ikut hidup di
						    PDF cetak; di dalam editor kliknya dicegat untuk lompat. */}
						{attrs.style === 'link' ? (
							<a
								href={`#${tocAnchorId(item.pos)}`}
								onClick={(e) => {
									e.preventDefault()
									onJump(item.pos)
								}}
								className="min-w-0 max-w-[80%] shrink-0 truncate"
							>
								{item.text || 'Tanpa judul'}
							</a>
						) : (
							<span className="min-w-0 max-w-[80%] shrink-0 truncate">{item.text || 'Tanpa judul'}</span>
						)}
						{showPage && attrs.tabLeader !== 'none' && (
							/* Pengisi merentang sampai kolom nomor: karakter diulang jauh
							   melebihi lebar teks lalu dipotong overflow (§A5.5 no. 5). */
							<span
								aria-hidden
								className="min-w-4 flex-1 select-none overflow-hidden whitespace-nowrap tracking-[2px] text-faint"
							>
								{leaderChar(attrs.tabLeader).repeat(400)}
							</span>
						)}
						{showPage && (
							<span className={cn('shrink-0 tabular-nums text-subtle', attrs.tabLeader === 'none' && 'ml-auto')}>
								{page}
							</span>
						)}
					</li>
				)
			})}
		</ul>
	)
}

/** Satu baris snapshot/salinan: `judul<TAB>halaman` bila nomor tampil. */
function snapshotText(entries: TocEntry[], attrs: TocBlockAttrs): string {
	return entries
		.map(({ item, page }) =>
			attrs.showPageNumbers && page !== undefined ? `${item.text}\t${page}` : item.text,
		)
		.join('\n')
}

function copyAsText(entries: TocEntry[], attrs: TocBlockAttrs): void {
	void navigator.clipboard?.writeText(snapshotText(entries, attrs))
}

/**
 * Permintaan membuka dialog setelan untuk satu blok TOC tertentu.
 *
 * Lewat event DOM (bukan context) supaya NodeView tidak perlu mengenal
 * React-context dialog; `apply` menulis langsung ke node pemanggil, jadi
 * dialog tak perlu menebak node mana yang sedang dipilih.
 */
export interface TocSettingsRequest {
	attrs: TocBlockAttrs
	apply: (patch: Partial<TocBlockAttrs>) => void
}

export const TOC_SETTINGS_EVENT = 'writerhub:toc-settings'
export function openTocSettings(
	dom: HTMLElement,
	attrs: TocBlockAttrs,
	apply: (patch: Partial<TocBlockAttrs>) => void,
): void {
	const detail: TocSettingsRequest = { attrs, apply }
	dom.dispatchEvent(new CustomEvent<TocSettingsRequest>(TOC_SETTINGS_EVENT, { bubbles: true, detail }))
}

/**
 * Minta semua blok TOC menyegarkan diri - didispatch sebelum ekspor DOCX
 * supaya snapshot yang ikut diekspor mutakhir (§A5.3).
 */
export const TOC_REFRESH_EVENT = 'writerhub:toc-refresh'
export function refreshTocBlocks(dom: HTMLElement): void {
	dom.dispatchEvent(new CustomEvent(TOC_REFRESH_EVENT, { bubbles: true }))
}

export const TocBlockNodeView = ReactNodeViewRenderer(TocBlockView)
