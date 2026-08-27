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
interface TocEntry {
	item: OutlineItem
	page?: number
}
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
function tocAnchorId(pos: number): string {
	return `toc-h-${pos}`
}

export function TocBlockView({
	node,
	editor,
	getPos,
	selected,
	updateAttributes,
	deleteNode,
}: NodeViewProps) {
	const attrs: TocBlockAttrs = {
		...DEFAULT_TOC_ATTRS,
		...(node.attrs as Partial<TocBlockAttrs>),
	}
	const [entries, setEntries] = useState<TocEntry[]>([])
	const attrsRef = useRef(attrs)
	attrsRef.current = attrs
	const updateAttributesRef = useRef(updateAttributes)
	updateAttributesRef.current = updateAttributes

	const refresh = useCallback(
		(writeSnapshot: boolean) => {
			const attrs = attrsRef.current
			const lo = Math.min(attrs.minLevel, attrs.maxLevel)
			const hi = Math.max(attrs.minLevel, attrs.maxLevel)
			const wantKind = KIND_FILTER[attrs.listKind]
			const items = readOutlineItems(editor.state.doc).filter(
				(item) => item.kind === wantKind && item.level >= lo && item.level <= hi,
			)
			const state = paginationKey.getState(editor.state)
			const stride = state?.geometry?.pageStride ?? pageGeometry().pageStride
			const next: TocEntry[] = items.map((item) => {
				let page: number | undefined
				if (item.pos + 1 <= editor.state.doc.content.size) {
					try {
						const el = editor.view.nodeDOM(item.pos)
						if (el instanceof HTMLElement) {
							if (attrs.showPageNumbers) page = Math.floor(el.offsetTop / stride) + 1
							if (attrs.style === 'link') el.id = tocAnchorId(item.pos)
						}
					} catch {}
				}
				return { item, page }
			})
			setEntries(next)
			if (writeSnapshot) {
				const snapshot = snapshotText(next, attrs)
				if (snapshot !== attrs.snapshot) updateAttributesRef.current({ snapshot })
			}
		},
		[editor],
	)
	const minLevel = attrs.minLevel
	const maxLevel = attrs.maxLevel
	const listKind = attrs.listKind
	const showPageNumbers = attrs.showPageNumbers
	const style = attrs.style
	useEffect(() => {
		refresh(false)
	}, [refresh, minLevel, maxLevel, listKind, showPageNumbers, style])
	useEffect(() => {
		const dom = editor.view.dom
		const onRefreshRequest = () => refresh(true)
		window.addEventListener('beforeprint', onRefreshRequest)
		dom.addEventListener(TOC_REFRESH_EVENT, onRefreshRequest)
		return () => {
			window.removeEventListener('beforeprint', onRefreshRequest)
			dom.removeEventListener(TOC_REFRESH_EVENT, onRefreshRequest)
		}
	}, [editor, refresh])
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
			.insertContentAt(
				{ from: pos, to: pos + node.nodeSize },
				paragraphs.length ? paragraphs : [{ type: 'paragraph' }],
			)
			.run()
	}
	const jumpTo = (pos: number) => {
		editor
			.chain()
			.focus()
			.setTextSelection(Math.min(pos + 1, editor.state.doc.content.size))
			.scrollIntoView()
			.run()
	}
	const [gaps, setGaps] = useState<TocGap[]>([])
	const [pageTick, setPageTick] = useState(0)
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
		let normalSpacing = Number.POSITIVE_INFINITY
		const splitAt = new Set(gaps.map((gap) => gap.before))
		for (let i = 1; i < lis.length; i++) {
			if (splitAt.has(i)) continue
			normalSpacing = Math.min(
				normalSpacing,
				lis[i].offsetTop - (lis[i - 1].offsetTop + lis[i - 1].offsetHeight),
			)
		}
		if (!Number.isFinite(normalSpacing)) normalSpacing = 0
		let chrome = 0
		for (const gap of gaps) {
			const i = gap.before
			if (i <= 0 || i >= lis.length) continue
			chrome =
				lis[i].offsetTop - (lis[i - 1].offsetTop + lis[i - 1].offsetHeight) - normalSpacing - gap.height
			break
		}
		const next: TocGap[] = []
		let gapIndex = 0
		let inserted = 0
		let shift = 0
		for (let i = 0; i < lis.length; i++) {
			while (gapIndex < gaps.length && gaps[gapIndex].before <= i) {
				inserted += gaps[gapIndex].height + chrome
				gapIndex++
			}
			const top = base + (lis[i].offsetTop - inserted) + shift
			const bottom = top + lis[i].offsetHeight
			const sheet = Math.floor(top / pageStride)
			if (bottom > sheet * pageStride + contentHeight + 0.5) {
				const height = (sheet + 1) * pageStride - top
				next.push({ before: i, height })
				shift += height + chrome
			}
		}

		const same =
			gaps.length === next.length &&
			gaps.every((gap, i) => gap.before === next[i].before && Math.abs(gap.height - next[i].height) < 1)
		if (!same) setGaps(next)
	}, [editor, entries, gaps, pageTick])
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
									onRefresh={() => refresh(true)}
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
						 */}
						<DropdownItem
							icon={<Settings2 className="h-3.5 w-3.5" />}
							onSelect={() => {
								close()
								onSettings()
							}}
						>
							Setelan daftar isi…
						</DropdownItem>
						<DropdownItem
							icon={<Copy className="h-3.5 w-3.5" />}
							onSelect={() => {
								close()
								onCopy()
							}}
						>
							Salin sebagai teks
						</DropdownItem>
						<DropdownItem
							icon={<Type className="h-3.5 w-3.5" />}
							onSelect={() => {
								close()
								onConvert()
							}}
						>
							Ubah jadi teks biasa
						</DropdownItem>
						<DropdownSeparator />
						<DropdownItem
							icon={<Trash2 className="h-3.5 w-3.5" />}
							onSelect={() => {
								close()
								onDelete()
							}}
						>
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
							<span
								className={cn('shrink-0 tabular-nums text-subtle', attrs.tabLeader === 'none' && 'ml-auto')}
							>
								{page}
							</span>
						)}
					</li>
				)
			})}
		</ul>
	)
}
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
export const TOC_REFRESH_EVENT = 'writerhub:toc-refresh'
export function refreshTocBlocks(dom: HTMLElement): void {
	dom.dispatchEvent(new CustomEvent(TOC_REFRESH_EVENT, { bubbles: true }))
}

export const TocBlockNodeView = ReactNodeViewRenderer(TocBlockView)
