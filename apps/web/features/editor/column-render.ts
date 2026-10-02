import type { Node as PMNode } from '@tiptap/pm/model'
import type { Selection, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { REGION_SHEET_GAP_ATTRIBUTE, REGION_SPACE_ATTRIBUTE } from './pagination'

/*
 * Tampilan wilayah berkolom.
 *
 * Paragraf adalah SATU elemen DOM milik ProseMirror, jadi memecahnya ke dua
 * kolom dilakukan dengan teknik tampilan "pangkas + salin":
 *
 * - blok aslinya diposisikan mutlak di petak salah satu potongannya dan
 *   dipangkas (`clip-path`) tepat di batas baris, sehingga hanya baris milik
 *   potongan itu yang terlihat;
 * - potongan lainnya digambar salinan visual (widget, `aria-hidden`, tidak bisa
 *   disunting) yang digeser supaya barisnya jatuh tepat di petaknya.
 *
 * Blok asli MENGIKUTI KURSOR: ia selalu ditaruh di potongan tempat kepala
 * seleksi berada. Dengan begitu kursor, komposisi IME, dan `scrollIntoView`
 * tetap milik peramban sendiri - tidak ada kursor tiruan. Salinan diperbarui
 * setiap kali DOM blok aslinya berubah (`ColumnClones`).
 */

export const CLONE_CLASS = 'columns-clone'
const CLONE_HEADER_CLASS = 'columns-clone-header'
const SELECTION_CLASS = 'columns-clone-selection'
/** Kelonggaran pangkas mendatar: tanda daftar dan huruf miring boleh menonjol sedikit. */
const CLIP_SLACK = 24

export interface PlannedFragment {
	/** Puncak petak (koordinat badan naskah); salinan kepala tabel, bila ada, di bagian atasnya. */
	top: number
	left: number
	width: number
	/** Bagian blok yang tampil: mulai `offset`, setinggi `height`. */
	offset: number
	height: number
	header: number
	/** Posisi naskah awal potongan ini (baris pertamanya). */
	from: number
}

export interface PlannedItem {
	/** Posisi butir saat diukur - pengenal yang tidak ikut dipetakan. */
	key: number
	pos: number
	nodeSize: number
	marginTop: number
	fragments: PlannedFragment[]
}

export interface RegionPlan {
	/** Posisi awal wilayah (sesudah pembatas pembukanya). */
	pos: number
	/** Puncak wilayah (koordinat badan naskah). */
	top: number
	height: number
	sheetGap: number
	parentWidth: number
	/** Tata letak kolom wilayah - dibaca salinan cetak. */
	count: number
	gap: number
	balance: boolean
	items: PlannedItem[]
}

/** Potongan tempat blok asli ditaruh, per posisi butir yang terpotong (0 bila tidak tercatat). */
export type ActiveFragments = ReadonlyMap<number, number>

/**
 * Potongan yang dipaksakan untuk kepala seleksi tertentu.
 *
 * Posisi di batas dua potongan (akhir baris terakhir potongan kiri = awal
 * baris pertama potongan kanan) tidak membawa arah; peramban menggambar
 * kursornya di salah satu baris menurut cara kursor tiba di sana (End,
 * panah). Bila kursor ternyata tergambar di potongan lain, potongan itu
 * dipatok selama kepala seleksinya tidak bergerak (lihat `caretFragment`).
 */
export interface FragmentPin {
	pos: number
	index: number
	head: number
}

export function activeFragments(
	plans: readonly RegionPlan[],
	selection: Selection,
	pin: FragmentPin | null = null,
): Map<number, number> {
	const active = new Map<number, number>()
	const head = selection.head
	for (const plan of plans) {
		for (const item of plan.items) {
			if (item.fragments.length < 2) continue
			if (head <= item.pos || head >= item.pos + item.nodeSize) continue
			let index = 0
			item.fragments.forEach((fragment, candidate) => {
				if (fragment.from <= head) index = candidate
			})
			if (pin && pin.pos === item.pos && pin.head === head && pin.index < item.fragments.length)
				index = pin.index
			if (index > 0) active.set(item.pos, index)
		}
	}
	return active
}

/**
 * Potongan tempat peramban SEBENARNYA menggambar kursor, bila berbeda dari
 * potongan aktif - dibaca dari kotak seleksi DOM (tetap ada walau dipangkas).
 */
export function caretFragment(
	view: EditorView,
	plans: readonly RegionPlan[],
	active: ActiveFragments,
): FragmentPin | null {
	const { selection } = view.state
	if (!selection.empty || view.composing) return null
	const head = selection.head
	const item = plans
		.flatMap((plan) => plan.items)
		.find((entry) => entry.fragments.length > 1 && head > entry.pos && head < entry.pos + entry.nodeSize)
	if (!item) return null
	const element = view.nodeDOM(item.pos)
	const dom = view.dom.ownerDocument.getSelection()
	if (!(element instanceof HTMLElement) || !dom || dom.rangeCount === 0 || !element.contains(dom.focusNode))
		return null
	const rect = dom.getRangeAt(0).getClientRects()[0]
	if (!rect) return null
	const base = element.getBoundingClientRect()
	const scale = element.offsetWidth > 0 ? base.width / element.offsetWidth || 1 : 1
	const middle = (rect.top + rect.height / 2 - base.top) / scale
	const index = item.fragments.findIndex(
		(fragment) => middle >= fragment.offset && middle < fragment.offset + fragment.height,
	)
	if (index < 0 || index === (active.get(item.pos) ?? 0)) return null
	return { pos: item.pos, index, head }
}

export function sameActive(a: ActiveFragments, b: ActiveFragments): boolean {
	if (a.size !== b.size) return false
	for (const [pos, index] of a) if (b.get(pos) !== index) return false
	return true
}

/** Rencana yang ikut bergeser bersama suntingan, sampai pengukuran berikutnya menggantinya. */
export function mapPlans(plans: readonly RegionPlan[], tr: Transaction): RegionPlan[] {
	return plans.map((plan) => ({
		...plan,
		pos: tr.mapping.map(plan.pos, -1),
		items: plan.items.flatMap((item) => {
			const mapped = tr.mapping.mapResult(item.pos, 1)
			if (mapped.deletedAfter) return []
			const node = tr.doc.nodeAt(mapped.pos)
			if (!node) return []
			return [
				{
					...item,
					pos: mapped.pos,
					nodeSize: node.nodeSize,
					fragments: item.fragments.map((fragment) => ({
						...fragment,
						from: tr.mapping.map(fragment.from, 1),
					})),
				},
			]
		}),
	}))
}

const round = (value: number) => Math.round(value * 100) / 100

function regionSpaceElement(plan: RegionPlan): HTMLElement {
	const element = document.createElement('div')
	element.className = 'columns-region-space'
	element.style.height = `${Math.round(plan.height)}px`
	element.setAttribute(REGION_SPACE_ATTRIBUTE, String(plan.pos))
	element.setAttribute(REGION_SHEET_GAP_ATTRIBUTE, String(Math.round(plan.sheetGap)))
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	return element
}

interface CloneSpec {
	/** Pengenal butir (`PlannedItem.key`). */
	item: number
	fragment: PlannedFragment
	/** Salinan kepala tabel (bukan isi potongan). */
	header: boolean
	key: string
}

/** Elemen salinan yang hidup, per editor - supaya pengisinya tidak perlu menyisir DOM. */
const registries = new WeakMap<EditorView, Set<HTMLElement>>()

function cloneElement(view: EditorView, spec: CloneSpec): HTMLElement {
	const { fragment } = spec
	const element = document.createElement('div')
	element.className = spec.header ? `${CLONE_CLASS} ${CLONE_HEADER_CLASS}` : CLONE_CLASS
	const top = spec.header ? fragment.top : fragment.top + fragment.header
	const height = spec.header ? fragment.header : fragment.height
	/* `margin: 0` - salinan anak langsung badan naskah, jadi `.document-body > * + *`
	 * ikut memberinya margin atas yang menggeser petaknya. */
	element.style.cssText =
		`position:absolute;margin:0;top:${round(top)}px;left:${round(fragment.left)}px;width:${round(fragment.width)}px;` +
		`height:${round(height)}px;clip-path:inset(0 -${CLIP_SLACK}px 0 -${CLIP_SLACK}px)`
	element.setAttribute('aria-hidden', 'true')
	element.contentEditable = 'false'
	element.dataset.cloneOf = String(spec.item)
	element.dataset.offset = String(spec.header ? 0 : fragment.offset)
	if (!spec.header) element.dataset.from = String(fragment.from)
	let registry = registries.get(view)
	if (!registry) {
		registry = new Set()
		registries.set(view, registry)
	}
	registry.add(element)
	return element
}

function geometryKey(fragment: PlannedFragment): string {
	return [fragment.top, fragment.left, fragment.width, fragment.offset, fragment.height, fragment.header]
		.map((value) => Math.round(value))
		.join('_')
}

export function buildDecorations(
	doc: PMNode,
	plans: readonly RegionPlan[],
	active: ActiveFragments,
): DecorationSet {
	const decorations: Decoration[] = []
	const widget = (pos: number, spec: CloneSpec) =>
		Decoration.widget(pos, (view) => cloneElement(view, spec), {
			side: 1,
			key: spec.key,
			ignoreSelection: true,
			columnsClone: spec,
		})

	for (const plan of plans) {
		decorations.push(
			Decoration.widget(plan.pos, () => regionSpaceElement(plan), {
				side: -1,
				key: `columns-region-${plan.pos}-${Math.round(plan.height)}-${Math.round(plan.sheetGap)}`,
			}),
		)

		for (const item of plan.items) {
			const node = doc.nodeAt(item.pos)
			if (!node || item.fragments.length === 0) continue
			const end = item.pos + node.nodeSize
			const split = item.fragments.length > 1
			const shown = active.get(item.pos) ?? 0
			const own = item.fragments[shown] ?? item.fragments[0]
			const top = own.top + own.header - own.offset - item.marginTop
			const right = plan.parentWidth - own.left - own.width
			const clip = split
				? `;clip-path:inset(${round(own.offset)}px -${CLIP_SLACK}px calc(100% - ${round(own.offset + own.height)}px) -${CLIP_SLACK}px)`
				: ''
			decorations.push(
				Decoration.node(item.pos, end, {
					class: split ? 'columns-item columns-split' : 'columns-item',
					style: `position:absolute;top:${round(top)}px;left:${round(own.left)}px;right:${round(right)}px${clip}`,
				}),
			)

			item.fragments.forEach((fragment, index) => {
				if (fragment.header > 0) {
					decorations.push(
						widget(end, {
							item: item.key,
							fragment,
							header: true,
							key: `columns-head-${item.key}-${index}-${geometryKey(fragment)}`,
						}),
					)
				}
				if (!split || index === shown) return
				decorations.push(
					widget(end, {
						item: item.key,
						fragment,
						header: false,
						key: `columns-clone-${item.key}-${index}-${geometryKey(fragment)}`,
					}),
				)
			})
		}
	}

	return DecorationSet.create(doc, decorations)
}

/*
 * Gaya yang datang dari aturan ANAK LANGSUNG badan naskah - tipografi dokumen
 * (`.document-body > p`) dan jarak antarblok (`.document-body > * + *`) - dan
 * pembungkusan teks milik badan yang dapat disunting. Salinan (layar maupun
 * cetak) duduk di dalam widget `contenteditable="false"`, dan TipTap memberi
 * widget semacam itu `white-space: normal`: spasi di ujung baris tidak lagi
 * memakan tempat, barisnya membungkus lain dari blok asli, dan potongannya
 * tidak lagi tepat di batas baris. Semua nilai itu karenanya disalin apa
 * adanya dari blok asli.
 */
const DIRECT_CHILD_STYLES = [
	'white-space',
	'word-break',
	'overflow-wrap',
	'word-spacing',
	'tab-size',
	'hyphens',
	'font-kerning',
	'font-feature-settings',
	'font-variant-ligatures',
	'font-variation-settings',
	'font-optical-sizing',
	'font-stretch',
	'text-transform',
	'margin-top',
	'margin-bottom',
	'margin-left',
	'margin-right',
	'text-indent',
	'text-align',
	'text-align-last',
	'font-family',
	'font-size',
	'font-weight',
	'font-style',
	'line-height',
	'letter-spacing',
	'border-bottom-width',
	'border-bottom-style',
	'border-bottom-color',
	'padding-bottom',
] as const

/** Salinan blok tanpa jejak dekorasi kolom; gaya anak langsungnya ditulis inline. */
export function detachedCopy(original: HTMLElement): HTMLElement {
	const computed = getComputedStyle(original)
	const copy = original.cloneNode(true) as HTMLElement
	copy.classList.remove('columns-item', 'columns-split', 'ProseMirror-selectednode')
	for (const property of ['position', 'top', 'left', 'right', 'clip-path'])
		copy.style.removeProperty(property)
	for (const property of DIRECT_CHILD_STYLES)
		copy.style.setProperty(property, computed.getPropertyValue(property))
	copy.removeAttribute('id')
	for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id')
	return copy
}

/*
 * Salinan visual: dibuat ulang dari blok asli setiap kali DOM-nya berubah.
 * Margin atas/bawahnya dinolkan karena petak salinan sudah menghitung jarak
 * itu; margin kiri/kanan (indentasi) dibiarkan.
 */
function copyOf(original: HTMLElement, offset: number): HTMLElement {
	const copy = detachedCopy(original)
	copy.style.position = 'relative'
	copy.style.top = `${-offset}px`
	copy.style.marginTop = '0'
	copy.style.marginBottom = '0'
	return copy
}

/**
 * Pemelihara salinan sebuah editor: mengisi salinan baru, menyalin ulang saat
 * DOM blok aslinya berubah, dan menggambar sorotan seleksi di dalamnya.
 */
export class ColumnClones {
	private readonly observer: MutationObserver
	private observed = new Set<HTMLElement>()
	private filled = new WeakMap<HTMLElement, HTMLElement>()
	private stale = new WeakSet<HTMLElement>()

	constructor(
		private readonly view: EditorView,
		/** Posisi terkini butir dari pengenalnya (`PlannedItem.key`). */
		private readonly positionOf: (key: number) => number | undefined,
	) {
		this.observer = new MutationObserver((records) => {
			for (const record of records) {
				const target = record.target instanceof Element ? record.target : record.target.parentElement
				const original = target?.closest('.columns-split')
				if (original instanceof HTMLElement) this.stale.add(original)
			}
			this.sync()
		})
	}

	/** Salinan yang masih terpasang di DOM. */
	clones(): HTMLElement[] {
		const registry = registries.get(this.view)
		if (!registry) return []
		const alive: HTMLElement[] = []
		for (const element of registry) {
			if (element.isConnected) alive.push(element)
			else registry.delete(element)
		}
		return alive
	}

	originalOf(clone: HTMLElement): HTMLElement | null {
		const pos = this.positionOf(Number(clone.dataset.cloneOf))
		if (pos === undefined) return null
		const dom = this.view.nodeDOM(pos)
		return dom instanceof HTMLElement ? dom : null
	}

	sync(): void {
		const originals = new Set<HTMLElement>()
		for (const clone of this.clones()) {
			const original = this.originalOf(clone)
			if (!original) continue
			originals.add(original)
			if (this.filled.get(clone) !== original || this.stale.has(original) || clone.childElementCount === 0) {
				const offset = Number(clone.dataset.offset) || 0
				clone.replaceChildren(copyOf(original, offset))
				this.filled.set(clone, original)
			}
		}
		for (const original of originals) this.stale.delete(original)

		const same =
			originals.size === this.observed.size && [...originals].every((element) => this.observed.has(element))
		if (!same) {
			this.observer.disconnect()
			for (const original of originals) {
				this.observer.observe(original, {
					subtree: true,
					childList: true,
					characterData: true,
					attributes: true,
				})
			}
			this.observed = originals
		}
		this.paintSelection()
	}

	/**
	 * Sorotan seleksi di salinan. Seleksi bawaan peramban hanya tergambar di
	 * blok asli; bagian yang jatuh di potongan bersalinan digambar di sini dari
	 * kotak seleksi blok asli (tata letaknya tetap ada walau dipangkas),
	 * digeser ke petak salinannya.
	 */
	private paintSelection(): void {
		const { view } = this
		const { from, to, empty } = view.state.selection
		const focused = view.hasFocus()
		for (const clone of this.clones()) {
			for (const old of clone.querySelectorAll(`.${SELECTION_CLASS}`)) old.remove()
			if (empty || !focused || clone.classList.contains(CLONE_HEADER_CLASS)) continue
			const pos = this.positionOf(Number(clone.dataset.cloneOf))
			const node = pos === undefined ? null : view.state.doc.nodeAt(pos)
			const original = this.originalOf(clone)
			if (pos === undefined || !node || !original) continue
			const start = Math.max(from, pos + 1)
			const end = Math.min(to, pos + node.nodeSize - 1)
			if (start >= end) continue

			const range = document.createRange()
			try {
				const head = view.domAtPos(start)
				const tail = view.domAtPos(end)
				range.setStart(head.node, head.offset)
				range.setEnd(tail.node, tail.offset)
			} catch {
				continue
			}
			const base = original.getBoundingClientRect()
			const scale = original.offsetWidth > 0 ? base.width / original.offsetWidth || 1 : 1
			const offset = Number(clone.dataset.offset) || 0
			const height = clone.offsetHeight
			for (const rect of range.getClientRects()) {
				if (rect.width <= 0 || rect.height <= 0) continue
				const top = (rect.top - base.top) / scale - offset
				const bottom = (rect.bottom - base.top) / scale - offset
				if (bottom <= 0 || top >= height) continue
				const mark = document.createElement('div')
				mark.className = SELECTION_CLASS
				mark.style.cssText = `top:${round(top)}px;left:${round((rect.left - base.left) / scale)}px;width:${round(
					rect.width / scale,
				)}px;height:${round(bottom - top)}px`
				clone.appendChild(mark)
			}
		}
	}

	destroy(): void {
		this.observer.disconnect()
		this.observed.clear()
	}
}
