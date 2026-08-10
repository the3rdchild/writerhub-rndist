'use client'

import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { TableMap } from '@tiptap/pm/tables'
import { dropIndex, locateTableAt, type TableLocation } from './table-ops'

/**
 * Lapisan handle tabel yang melayang mengikuti sel di bawah tetikus.
 *
 * Tiga elemen saja - handle baris (kiri), handle kolom (atas), dan tombol •••
 * di sel - yang diposisikan ulang tiap kali tetikus berpindah sel, bukan satu
 * widget per baris/kolom/sel. Sebelumnya handle dipasang sebagai dekorasi
 * ProseMirror, dan itu punya dua batas keras: jumlah elemennya tumbuh mengikuti
 * ukuran tabel (••• di tiap sel berarti baris × kolom widget yang dibangun
 * ulang tiap dokumen berubah), dan "kolom yang sedang di-hover" tak bisa
 * diungkapkan di CSS - tidak ada selector kolom.
 *
 * Lapisannya `position: fixed` di atas `document.body`, jadi koordinatnya
 * langsung koordinat layar: tak perlu memperhitungkan transform zoom kanvas.
 * Konsekuensinya posisi harus dihitung ulang saat menggulung - sama seperti
 * menu konteksnya.
 */

export const tableHandlesKey = new PluginKey('tableHandles')

/** Sumbu yang diwakili sebuah handle. */
export type HandleAxis = 'row' | 'col'
/** Dari mana menu dibuka - menentukan apa yang ikut terpilih saat dibuka. */
export type MenuOrigin = HandleAxis | 'cell'

export interface HandleOpen extends TableLocation {
	origin: MenuOrigin
	/** Elemen jangkar menu; menu mengikutinya saat halaman digulir. */
	anchor: HTMLElement
}

export interface TableHandlesOptions {
	onMenu: (open: HandleOpen) => void
	/** Sisip baris/kolom baru tepat setelah `index` (bawah untuk baris, kanan
	 *  untuk kolom). */
	onInsert: (axis: HandleAxis, tablePos: number, index: number) => void
	/** Pindah baris/kolom setelah diseret. */
	onMove: (axis: HandleAxis, tablePos: number, fromIndex: number, toIndex: number) => void
	/** Selama menu terbuka lapisan berhenti mengikuti tetikus, supaya jangkar
	 *  menunya tidak lari ke sel lain. */
	isFrozen?: () => boolean
}

const SVG =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
const ICON_PLUS = `${SVG}<path d="M5 12h14"/><path d="M12 5v14"/></svg>`
const ICON_GRIP = `${SVG}<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`
const ICON_DOTS = `${SVG}<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`

/** Jarak handle dari tepi tabel, dan jarak ••• dari sudut sel. */
const OUTSET = 6
const INSET = 5
/** Geser sejauh ini baru dianggap seret, bukan klik. */
const DRAG_THRESHOLD = 3

type HoverState = TableLocation & { cell: HTMLElement }

interface DragSession {
	axis: HandleAxis
	tablePos: number
	fromIndex: number
	/** Koordinat tiap batas baris/kolom (count + 1 nilai). */
	edges: number[]
	/** Rentang layar baris/kolom sumber. */
	span: { start: number; size: number }
	tableRect: DOMRect
	boundary: number
	moved: boolean
}

/** Baris hasil dekorasi paginasi (spacer & salinan header) bukan bagian naskah -
 *  hover di sana tak punya padanan posisi dokumen. */
function isPaginationRow(cell: Element): boolean {
	const row = cell.closest('tr')
	return !!row && (row.hasAttribute('data-spacer-for') || row.classList.contains('table-header-repeat'))
}

class HandleLayer {
	private root: HTMLElement
	private rowHandle: HTMLElement
	private colHandle: HTMLElement
	private cellButton: HTMLElement
	private line: HTMLElement
	private shade: HTMLElement

	private hover: HoverState | null = null
	private drag: DragSession | null = null
	private frame = 0

	constructor(
		private readonly view: EditorView,
		private readonly opts: TableHandlesOptions,
	) {
		this.root = element('div', 'table-handle-layer')

		this.rowHandle = element('div', 'table-handle table-handle--row')
		this.rowHandle.append(
			this.makeAdd('row', 'Add row below'),
			this.makeGrip('row', 'Row menu, drag to reorder'),
		)

		this.colHandle = element('div', 'table-handle table-handle--col')
		this.colHandle.append(
			this.makeGrip('col', 'Column menu, drag to reorder'),
			this.makeAdd('col', 'Add column right'),
		)

		this.cellButton = this.makeButton('table-handle-btn table-handle-cell', ICON_DOTS, 'Cell menu')
		this.cellButton.addEventListener('click', (e) => {
			e.preventDefault()
			if (!this.hover) return
			this.opts.onMenu({ ...locationOf(this.hover), origin: 'cell', anchor: this.cellButton })
		})

		this.line = element('div', 'table-handle-line')
		this.shade = element('div', 'table-handle-shade')

		this.root.append(this.rowHandle, this.colHandle, this.cellButton, this.shade, this.line)
		this.hideAll()
		document.body.appendChild(this.root)

		document.addEventListener('mousemove', this.onMouseMove, { passive: true })
		window.addEventListener('scroll', this.onReflow, true)
		window.addEventListener('resize', this.onReflow)
	}

	// ── penyusunan elemen ──────────────────────────────────────────────────

	private makeButton(className: string, icon: string, label: string): HTMLElement {
		const btn = document.createElement('button')
		btn.type = 'button'
		btn.className = className
		btn.innerHTML = icon
		btn.setAttribute('aria-label', label)
		// Menahan fokus tetap di editor: tanpa ini, seleksi sel yang baru dibuat
		// langsung buyar begitu tombolnya ditekan.
		btn.addEventListener('mousedown', (e) => e.preventDefault())
		return btn
	}

	private makeAdd(axis: HandleAxis, label: string): HTMLElement {
		const btn = this.makeButton('table-handle-btn', ICON_PLUS, label)
		btn.addEventListener('click', (e) => {
			e.preventDefault()
			if (!this.hover) return
			const index = axis === 'row' ? this.hover.rowIndex : this.hover.colIndex
			this.opts.onInsert(axis, this.hover.tablePos, index)
		})
		return btn
	}

	private makeGrip(axis: HandleAxis, label: string): HTMLElement {
		const grip = this.makeButton('table-handle-btn table-handle-grip', ICON_GRIP, label)
		grip.addEventListener('pointerdown', (e) => this.startDrag(axis, grip, e))
		return grip
	}

	// ── mengikuti tetikus ──────────────────────────────────────────────────

	private onMouseMove = (e: MouseEvent) => {
		if (this.drag || this.opts.isFrozen?.()) return
		const target = e.target as HTMLElement | null
		if (!target?.closest) return
		// Tetikus berada di atas handle itu sendiri - pertahankan sel sekarang.
		if (this.root.contains(target)) return

		const cell = target.closest('td, th')
		if (!cell || !this.view.dom.contains(cell) || isPaginationRow(cell)) {
			this.clear()
			return
		}
		if (this.hover?.cell === cell) return

		const loc = this.locate(cell)
		if (!loc) {
			this.clear()
			return
		}
		this.hover = { ...loc, cell: cell as HTMLElement }
		this.render()
	}

	private onReflow = () => {
		if (!this.hover) return
		cancelAnimationFrame(this.frame)
		this.frame = requestAnimationFrame(() => this.render())
	}

	/** Terjemahkan sel DOM jadi posisi dokumen + indeks grid. */
	private locate(cell: Element): TableLocation | null {
		try {
			return locateTableAt(this.view.state, this.view.posAtDOM(cell, 0))
		} catch {
			return null
		}
	}

	private clear(): void {
		if (!this.hover) return
		this.hover = null
		this.hideAll()
	}

	private hideAll(): void {
		this.rowHandle.hidden = true
		this.colHandle.hidden = true
		this.cellButton.hidden = true
		this.line.hidden = true
		this.shade.hidden = true
	}

	// ── penempatan ─────────────────────────────────────────────────────────

	private render(): void {
		const hover = this.hover
		if (!hover || !hover.cell.isConnected) {
			this.clear()
			return
		}
		const cellRect = hover.cell.getBoundingClientRect()
		const row = hover.cell.closest('tr')
		const table = hover.cell.closest('table')
		if (!row || !table) {
			this.clear()
			return
		}
		// Sembunyikan begitu selnya tergulung keluar dari kanvas - lapisan ini
		// `fixed`, jadi tanpa pemeriksaan ini handle-nya melayang di atas bilah
		// alat atau penggaris.
		const clip = this.clipRect()
		if (clip && (cellRect.bottom < clip.top || cellRect.top > clip.bottom)) {
			this.hideAll()
			return
		}

		const rowRect = row.getBoundingClientRect()
		const tableRect = table.getBoundingClientRect()

		this.rowHandle.hidden = false
		place(
			this.rowHandle,
			tableRect.left - OUTSET - this.rowHandle.offsetWidth,
			rowRect.top + rowRect.height / 2 - this.rowHandle.offsetHeight / 2,
		)

		this.colHandle.hidden = false
		place(
			this.colHandle,
			cellRect.left + cellRect.width / 2 - this.colHandle.offsetWidth / 2,
			tableRect.top - OUTSET - this.colHandle.offsetHeight,
		)

		this.cellButton.hidden = false
		place(
			this.cellButton,
			cellRect.right - INSET - this.cellButton.offsetWidth,
			cellRect.top + INSET,
		)
	}

	/** Daerah yang boleh ditempati handle: kanvas dokumen, dikurangi penggaris. */
	private clipRect(): { top: number; bottom: number } | null {
		const canvas = this.view.dom.closest('.document-canvas')
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()
		const ruler = canvas.querySelector('.document-ruler-bar')
		const top = ruler ? Math.max(rect.top, ruler.getBoundingClientRect().bottom) : rect.top
		return { top, bottom: rect.bottom }
	}

	// ── seret untuk menyusun ulang ─────────────────────────────────────────

	private startDrag(axis: HandleAxis, grip: HTMLElement, e: PointerEvent): void {
		if (e.button !== 0 || !this.hover) return
		const hover = this.hover
		const geom = this.geometry(axis, hover.tablePos)
		if (!geom) return

		const fromIndex = axis === 'row' ? hover.rowIndex : hover.colIndex
		this.drag = {
			axis,
			tablePos: hover.tablePos,
			fromIndex,
			edges: geom.edges,
			span: geom.spans[fromIndex],
			tableRect: geom.tableRect,
			boundary: fromIndex,
			moved: false,
		}
		grip.setPointerCapture(e.pointerId)
		const origin = axis === 'row' ? e.clientY : e.clientX

		const onMove = (move: PointerEvent) => {
			const drag = this.drag
			if (!drag) return
			const at = axis === 'row' ? move.clientY : move.clientX
			if (!drag.moved && Math.abs(at - origin) < DRAG_THRESHOLD) return
			drag.moved = true
			drag.boundary = nearestEdge(drag.edges, at)
			this.renderDrag()
		}
		const onUp = () => {
			const drag = this.drag
			grip.releasePointerCapture(e.pointerId)
			grip.removeEventListener('pointermove', onMove)
			grip.removeEventListener('pointerup', onUp)
			grip.removeEventListener('pointercancel', onUp)
			this.drag = null
			this.line.hidden = true
			this.shade.hidden = true
			if (!drag) return
			if (!drag.moved) {
				// Bukan seret, melainkan klik: buka menunya.
				if (this.hover) {
					this.opts.onMenu({ ...locationOf(this.hover), origin: axis, anchor: grip })
				}
				return
			}
			const to = dropIndex(drag.fromIndex, drag.boundary)
			if (to !== drag.fromIndex) this.opts.onMove(axis, drag.tablePos, drag.fromIndex, to)
		}
		grip.addEventListener('pointermove', onMove)
		grip.addEventListener('pointerup', onUp)
		grip.addEventListener('pointercancel', onUp)
	}

	/** Garis sisip di batas tujuan + baris/kolom sumber diredupkan. */
	private renderDrag(): void {
		const drag = this.drag
		if (!drag) return
		const { tableRect, span, edges, boundary, axis } = drag

		this.shade.hidden = false
		this.line.hidden = false
		if (axis === 'row') {
			place(this.shade, tableRect.left, span.start, tableRect.width, span.size)
			place(this.line, tableRect.left, edges[boundary] - 1, tableRect.width, 2)
		} else {
			place(this.shade, span.start, tableRect.top, span.size, tableRect.height)
			place(this.line, edges[boundary] - 1, tableRect.top, 2, tableRect.height)
		}
	}

	/**
	 * Koordinat batas & rentang tiap baris/kolom, diambil dari DOM sel lewat
	 * `nodeDOM` - bukan dari `querySelectorAll('tr')`. Paginasi menyisipkan baris
	 * semu (spacer & salinan header) sebagai dekorasi, jadi urutan baris di DOM
	 * tidak sama dengan urutan baris di naskah.
	 */
	private geometry(
		axis: HandleAxis,
		tablePos: number,
	): { edges: number[]; spans: Array<{ start: number; size: number }>; tableRect: DOMRect } | null {
		const table = this.view.state.doc.nodeAt(tablePos)
		if (!table || table.type.spec.tableRole !== 'table') return null
		const tableDOM = this.view.nodeDOM(tablePos)
		if (!(tableDOM instanceof HTMLElement)) return null
		const tableEl = tableDOM.tagName === 'TABLE' ? tableDOM : tableDOM.querySelector('table')
		if (!tableEl) return null

		const map = TableMap.get(table)
		const count = axis === 'row' ? map.height : map.width
		const spans: Array<{ start: number; size: number }> = []
		const edges: number[] = []

		for (let i = 0; i < count; i++) {
			const rel = startingCell(map, axis, i)
			if (rel === null) return null
			const dom = this.view.nodeDOM(tablePos + 1 + rel)
			if (!(dom instanceof HTMLElement)) return null
			const rect = dom.getBoundingClientRect()
			const span =
				axis === 'row'
					? { start: rect.top, size: rect.height }
					: { start: rect.left, size: rect.width }
			spans.push(span)
			edges.push(span.start)
		}
		const last = spans[count - 1]
		if (!last) return null
		edges.push(last.start + last.size)

		return { edges, spans, tableRect: tableEl.getBoundingClientRect() }
	}

	// ── daur hidup ─────────────────────────────────────────────────────────

	update(view: EditorView, prevState: EditorState): void {
		if (this.drag) return
		// Perubahan seleksi saja dibiarkan: klik di dalam sel tak boleh membuat
		// handle-nya berkedip hilang.
		if (prevState.doc === view.state.doc) return
		// Menu sedang terbuka dan menjangkar ke salah satu tombol di lapisan ini:
		// tombolnya tak boleh lenyap, cukup ikuti tata letak yang baru.
		if (this.opts.isFrozen?.()) {
			this.render()
			return
		}
		// Naskah berubah (mengetik, undo, sunting dari kolaborator): ukuran sel
		// ikut bergeser dan indeks bisa basi. Handle disembunyikan sampai tetikus
		// bergerak lagi - sekaligus membuatnya tak mengganggu saat mengetik.
		this.clear()
	}

	destroy(): void {
		cancelAnimationFrame(this.frame)
		document.removeEventListener('mousemove', this.onMouseMove)
		window.removeEventListener('scroll', this.onReflow, true)
		window.removeEventListener('resize', this.onReflow)
		this.root.remove()
	}
}

function element(tag: string, className: string): HTMLElement {
	const el = document.createElement(tag)
	el.className = className
	return el
}

function place(el: HTMLElement, left: number, top: number, width?: number, height?: number): void {
	el.style.left = `${Math.round(left)}px`
	el.style.top = `${Math.round(top)}px`
	if (width !== undefined) el.style.width = `${Math.round(width)}px`
	if (height !== undefined) el.style.height = `${Math.round(height)}px`
}

function locationOf(hover: HoverState): TableLocation {
	const { tablePos, rowIndex, colIndex, rowCount, colCount } = hover
	return { tablePos, rowIndex, colIndex, rowCount, colCount }
}

/**
 * Offset sel yang BENAR-BENAR dimulai di baris/kolom `index`.
 *
 * Sel bergabung membuat `map.map[index * width]` bisa menunjuk sel milik baris
 * di atasnya - kotak layarnya membentang beberapa baris, dan batas sisipnya
 * jadi meleset satu baris. Karena itu dicari sel pertama yang titik awalnya
 * memang di baris/kolom ini.
 */
function startingCell(map: TableMap, axis: HandleAxis, index: number): number | null {
	const across = axis === 'row' ? map.width : map.height
	for (let i = 0; i < across; i++) {
		const rel = axis === 'row' ? map.map[index * map.width + i] : map.map[i * map.width + index]
		const rect = map.findCell(rel)
		if ((axis === 'row' ? rect.top : rect.left) === index) return rel
	}
	return null
}

/** Batas sisip terdekat dari koordinat tetikus. */
function nearestEdge(edges: number[], at: number): number {
	let best = 0
	let distance = Number.POSITIVE_INFINITY
	edges.forEach((edge, index) => {
		const d = Math.abs(edge - at)
		if (d < distance) {
			distance = d
			best = index
		}
	})
	return best
}

/**
 * Plugin ProseMirror untuk lapisan handle tabel. Didaftarkan dinamis lewat
 * `editor.registerPlugin` supaya callback-nya bisa menyentuh state React.
 */
export function createTableHandlesPlugin(opts: TableHandlesOptions): Plugin {
	return new Plugin({
		key: tableHandlesKey,
		view: (view) => new HandleLayer(view, opts),
	})
}
