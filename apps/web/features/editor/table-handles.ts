'use client'

import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TableMap } from '@tiptap/pm/tables'

/**
 * Handle baris & kolom yang muncul saat meng-hover tabel.
 *
 * Per baris: tombol "+" (sisip baris di bawah) + grip seret/menu di tepi kiri.
 * Per kolom: tombol "•••" di pojok kanan sel baris pertama.
 *
 * Widget ditempel sebagai dekorasi ProseMirror DI DALAM sel (bukan di antara
 * sel): posisi sel dari `TableMap` menunjuk ke node sel-nya, jadi widget harus
 * digeser satu ke dalam. Kalau tidak, elemen handle mendarat langsung di dalam
 * `<tr>` dan peramban membungkusnya jadi anonymous table-cell - kolom bergeser
 * dan tabel terlihat "meledak".
 *
 * Klik kanan (contextmenu) pada sel tabel juga memicu menu; ditangani komponen
 * React lewat event listener, bukan di sini.
 */

export const tableHandlesKey = new PluginKey<DecorationSet>('tableHandles')

export type HandleAxis = 'row' | 'col'

export interface HandleOpen {
	/** Sumbu yang diwakili handle - menentukan apa yang ikut terpilih. */
	axis: HandleAxis
	/** Posisi tepat sebelum node tabel. */
	tablePos: number
	rowIndex: number
	colIndex: number
	rowCount: number
	colCount: number
	/** Elemen jangkar menu; menu mengikutinya saat halaman digulir. */
	anchor: HTMLElement
}

export interface TableHandlesOptions {
	onMenu: (open: HandleOpen) => void
	/** Sisip baris/kolom baru tepat setelah `index`. */
	onInsert: (axis: HandleAxis, tablePos: number, index: number) => void
	/** Pindah baris/kolom (seret untuk menyusun ulang). */
	onMove: (axis: HandleAxis, tablePos: number, fromIndex: number, toIndex: number) => void
}

/** Status seret aktif. Disimpan di modul karena dekorasi dibangun ulang saat
 *  seret berlangsung, sementara `dataTransfer` tak bisa dibaca saat dragover. */
interface DragState {
	axis: HandleAxis
	tablePos: number
	fromIndex: number
}
let activeDrag: DragState | null = null

const SVG_OPEN =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
const ICON_PLUS = `${SVG_OPEN}<path d="M5 12h14"/><path d="M12 5v14"/></svg>`
const ICON_GRIP = `${SVG_OPEN}<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`
const ICON_DOTS = `${SVG_OPEN}<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`

interface HandleSpec {
	axis: HandleAxis
	tablePos: number
	rowIndex: number
	colIndex: number
	rowCount: number
	colCount: number
}

/** Tombol grip: buka menu saat diklik, jadi pegangan seret saat ditarik. */
function makeGrip(spec: HandleSpec, opts: TableHandlesOptions, wrap: HTMLElement, icon: string): HTMLElement {
	const { axis, tablePos } = spec
	const index = axis === 'row' ? spec.rowIndex : spec.colIndex

	const grip = document.createElement('button')
	grip.type = 'button'
	grip.className = 'table-handle-grip'
	grip.draggable = true
	grip.innerHTML = icon
	grip.setAttribute('aria-label', axis === 'row' ? `Row ${index + 1} menu` : `Column ${index + 1} menu`)

	grip.addEventListener('click', (e) => {
		e.preventDefault()
		e.stopPropagation()
		opts.onMenu({ ...spec, anchor: grip })
	})
	grip.addEventListener('dragstart', (e) => {
		activeDrag = { axis, tablePos, fromIndex: index }
		e.dataTransfer?.setData('text/plain', `${axis}:${index}`)
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
		wrap.classList.add('table-handle--dragging')
	})
	grip.addEventListener('dragend', () => {
		activeDrag = null
		wrap.classList.remove('table-handle--dragging')
	})

	// Handle ini juga menerima drop dari handle lain pada sumbu & tabel yang sama.
	const accepts = () =>
		!!activeDrag &&
		activeDrag.axis === axis &&
		activeDrag.tablePos === tablePos &&
		activeDrag.fromIndex !== index
	wrap.addEventListener('dragover', (e) => {
		if (!accepts()) return
		e.preventDefault()
		wrap.classList.add('table-handle--drop-target')
	})
	wrap.addEventListener('dragleave', () => wrap.classList.remove('table-handle--drop-target'))
	wrap.addEventListener('drop', (e) => {
		e.preventDefault()
		wrap.classList.remove('table-handle--drop-target')
		if (!accepts() || !activeDrag) return
		opts.onMove(axis, tablePos, activeDrag.fromIndex, index)
		activeDrag = null
	})

	return grip
}

/** Tombol "+" - menyisipkan baris/kolom baru setelah indeks handle. */
function makeAddButton(spec: HandleSpec, opts: TableHandlesOptions): HTMLElement {
	const { axis, tablePos } = spec
	const index = axis === 'row' ? spec.rowIndex : spec.colIndex
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'table-handle-add'
	btn.innerHTML = ICON_PLUS
	btn.setAttribute('aria-label', axis === 'row' ? 'Add row below' : 'Add column right')
	btn.addEventListener('mousedown', (e) => e.preventDefault())
	btn.addEventListener('click', (e) => {
		e.preventDefault()
		e.stopPropagation()
		opts.onInsert(axis, tablePos, index)
	})
	return btn
}

/** Bungkus handle: `<div>` non-editable berisi tombol-tombolnya. */
function makeHandle(spec: HandleSpec, opts: TableHandlesOptions): HTMLElement {
	const wrap = document.createElement('div')
	wrap.className = `table-handle table-handle--${spec.axis}`
	wrap.contentEditable = 'false'
	wrap.dataset.axis = spec.axis
	wrap.dataset.index = String(spec.axis === 'row' ? spec.rowIndex : spec.colIndex)

	if (spec.axis === 'row') {
		wrap.appendChild(makeAddButton(spec, opts))
		wrap.appendChild(makeGrip(spec, opts, wrap, ICON_GRIP))
	} else {
		wrap.appendChild(makeGrip(spec, opts, wrap, ICON_DOTS))
	}
	return wrap
}

/** Bangun dekorasi handle untuk SEMUA tabel di dokumen. */
function buildDecorations(state: EditorState, opts: TableHandlesOptions): DecorationSet {
	const decorations: Decoration[] = []

	state.doc.descendants((node, pos) => {
		if (node.type.spec.tableRole !== 'table') return true
		const map = TableMap.get(node)
		// Awal isi tabel; offset di TableMap relatif terhadap titik ini.
		const contentStart = pos + 1

		const base = { tablePos: pos, rowCount: map.height, colCount: map.width }

		for (let r = 0; r < map.height; r++) {
			const spec: HandleSpec = { ...base, axis: 'row', rowIndex: r, colIndex: 0 }
			// +1 = MASUK ke dalam sel, supaya handle jadi anak <td>, bukan anak <tr>.
			const inCell = contentStart + map.map[r * map.width] + 1
			decorations.push(
				Decoration.widget(inCell, () => makeHandle(spec, opts), {
					side: -1,
					key: `row-${pos}-${r}`,
					ignoreSelection: true,
					stopEvent: () => true,
				}),
			)
		}

		for (let c = 0; c < map.width; c++) {
			const spec: HandleSpec = { ...base, axis: 'col', rowIndex: 0, colIndex: c }
			const inCell = contentStart + map.map[c] + 1
			decorations.push(
				Decoration.widget(inCell, () => makeHandle(spec, opts), {
					side: -1,
					key: `col-${pos}-${c}`,
					ignoreSelection: true,
					stopEvent: () => true,
				}),
			)
		}

		// Tabel bersarang tidak didukung TableKit - tak perlu turun lebih dalam.
		return false
	})

	return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
}

/**
 * Pabrik plugin ProseMirror untuk handle tabel. Dipakai saat handle didaftarkan
 * secara dinamis lewat `editor.registerPlugin` (yang menerima plugin PM, bukan
 * ekstensi Tiptap), sehingga callback-nya bisa menyentuh state React.
 */
export function createTableHandlesPlugin(opts: TableHandlesOptions): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key: tableHandlesKey,
		state: {
			init: (_config, state) => buildDecorations(state, opts),
			// Posisi handle hanya bergantung pada struktur dokumen; selama dokumen
			// tak berubah, dekorasi lama tetap sahih. `newState` dipakai (bukan
			// `view.state`, yang masih tertinggal satu transaksi saat apply).
			apply: (tr, old, _oldState, newState) => (tr.docChanged ? buildDecorations(newState, opts) : old),
		},
		props: {
			decorations(state) {
				return tableHandlesKey.getState(state)
			},
		},
	})
}
