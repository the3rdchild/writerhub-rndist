import { type Editor } from '@tiptap/core'
import { type Node as PMNode } from '@tiptap/pm/model'
import { type EditorState } from '@tiptap/pm/state'
import { cellAround, CellSelection, findTable, moveTableColumn, moveTableRow, TableMap } from '@tiptap/pm/tables'
import { NO_COLOR } from '@/features/editor/custom-table'

/**
 * Operasi tabel tingkat-dokumen untuk handle baris/kolom.
 *
 * TableKit menyediakan sisip/hapus/gabung dasar, tapi belum ada "pindah
 * baris/kolom". `@tiptap/pm/tables` (bawaan, versi yang sama dipakai TableKit)
 * punya `moveTableRow`/`moveTableColumn` yang bekerja lewat transaksi murni -
 * cocok dipakai pada naskah Yjs tanpa konflik.
 *
 * Semua operasi menerima {@link CellTarget}: posisi tabel + indeks baris/kolom
 * dalam grid (0 = baris/kolom pertama, termasuk baris/kolom kepala). Sasaran
 * dibawa eksplisit karena handle bisa diklik pada tabel yang TIDAK memuat
 * kursor - mengandalkan seleksi saat itu akan menyasar tabel yang keliru.
 */

/** Sasaran operasi: satu sel pada tabel tertentu. */
export interface CellTarget {
	/** Posisi tepat sebelum node tabel (`findTable().pos`). */
	tablePos: number
	rowIndex: number
	colIndex: number
}

/** Hasil pencarian tabel + indeks baris/kolom dari posisi kursor. */
export interface TableLocation extends CellTarget {
	rowCount: number
	colCount: number
}

/** Node tabel pada `tablePos`, bila masih ada dan memang sebuah tabel. */
function tableNodeAt(editor: Editor, tablePos: number): PMNode | null {
	const node = editor.state.doc.nodeAt(tablePos)
	if (!node || node.type.spec.tableRole !== 'table') return null
	return node
}

/** Cari tabel dan indeks baris/kolom dari posisi (default: kursor). */
export function locateTable(editor: Editor, pos?: number): TableLocation | null {
	return locateTableAt(editor.state, pos ?? editor.state.selection.from)
}

/** Versi tingkat-state, dipakai lapisan handle yang hanya memegang EditorView. */
export function locateTableAt(state: EditorState, pos: number): TableLocation | null {
	if (pos < 0 || pos > state.doc.content.size) return null
	const $pos = state.doc.resolve(pos)
	const found = findTable($pos)
	if (!found) return null

	const map = TableMap.get(found.node)

	// `cellAround` memberi posisi tepat sebelum sel yang memuat $pos; `found
	// .start` adalah awal ISI tabel, jadi selisihnya = offset relatif yang
	// dipakai TableMap. Bila posisinya pas di sela antar sel (klik di batas),
	// jatuh kembali ke sel pertama.
	let rowIndex = 0
	let colIndex = 0
	const $cell = cellAround($pos)
	if ($cell) {
		try {
			const rect = map.findCell($cell.pos - found.start)
			rowIndex = rect.top
			colIndex = rect.left
		} catch {
			// Posisi bukan awal sel pada tabel ini - biarkan di 0,0.
		}
	}

	return {
		tablePos: found.pos,
		rowIndex,
		colIndex,
		rowCount: map.height,
		colCount: map.width,
	}
}

/** Ukuran grid tabel pada `tablePos`. */
export function tableSize(editor: Editor, tablePos: number): { rowCount: number; colCount: number } | null {
	const node = tableNodeAt(editor, tablePos)
	if (!node) return null
	const map = TableMap.get(node)
	return { rowCount: map.height, colCount: map.width }
}

/** Posisi node sel pada (rowIndex, colIndex) - dipakai `setCellSelection`. */
function cellPosAt(editor: Editor, tablePos: number, rowIndex: number, colIndex: number): number | null {
	const node = tableNodeAt(editor, tablePos)
	if (!node) return null
	const map = TableMap.get(node)
	if (rowIndex < 0 || rowIndex >= map.height || colIndex < 0 || colIndex >= map.width) return null
	// tablePos = sebelum tabel, +1 = awal isi tabel, + offset relatif = awal sel.
	return tablePos + 1 + map.map[rowIndex * map.width + colIndex]
}

/**
 * Taruh kursor di dalam sel sasaran.
 *
 * Sengaja BUKAN `setCellSelection`: seleksi sel menyorot seluruh isi selnya,
 * dan itu terbaca seperti "semua teks ini terpilih" padahal maksudnya cuma
 * menunjuk sel mana yang jadi sasaran menu. Perintah tabel TableKit sendiri
 * bekerja dari sel tempat kursor berada, jadi kursor saja sudah cukup.
 *
 * `at` boleh diisi posisi persis yang diklik supaya kursor mendarat di sana.
 */
export function focusCell(editor: Editor, target: CellTarget, at?: number): boolean {
	const cellStart = cellPosAt(editor, target.tablePos, target.rowIndex, target.colIndex)
	if (cellStart === null) return false
	const cell = editor.state.doc.nodeAt(cellStart)
	if (!cell) return false
	const inside = at !== undefined && at > cellStart && at < cellStart + cell.nodeSize ? at : cellStart + 1
	return editor.chain().focus().setTextSelection(inside).run()
}

/** Pilih seluruh baris (dipakai saat menu dibuka dari handle baris). */
export function selectRow(editor: Editor, tablePos: number, rowIndex: number): boolean {
	const size = tableSize(editor, tablePos)
	if (!size) return false
	const anchorCell = cellPosAt(editor, tablePos, rowIndex, 0)
	const headCell = cellPosAt(editor, tablePos, rowIndex, size.colCount - 1)
	if (anchorCell === null || headCell === null) return false
	return editor.chain().focus().setCellSelection({ anchorCell, headCell }).run()
}

/** Pilih seluruh kolom (dipakai saat menu dibuka dari handle kolom). */
export function selectColumn(editor: Editor, tablePos: number, colIndex: number): boolean {
	const size = tableSize(editor, tablePos)
	if (!size) return false
	const anchorCell = cellPosAt(editor, tablePos, 0, colIndex)
	const headCell = cellPosAt(editor, tablePos, size.rowCount - 1, colIndex)
	if (anchorCell === null || headCell === null) return false
	return editor.chain().focus().setCellSelection({ anchorCell, headCell }).run()
}

/** Apakah seleksi sel saat ini sudah mencakup sel sasaran? */
function selectionCoversCell(editor: Editor, target: CellTarget): boolean {
	const { selection } = editor.state
	if (!(selection instanceof CellSelection)) return false
	const found = findTable(selection.$anchorCell)
	if (!found || found.pos !== target.tablePos) return false
	const map = TableMap.get(found.node)
	const rect = map.rectBetween(selection.$anchorCell.pos - found.start, selection.$headCell.pos - found.start)
	return (
		target.rowIndex >= rect.top &&
		target.rowIndex < rect.bottom &&
		target.colIndex >= rect.left &&
		target.colIndex < rect.right
	)
}

/**
 * Arahkan seleksi ke sel sasaran sebelum sebuah perintah dijalankan.
 *
 * Seleksi multi-sel yang sudah memuat sel sasaran dipertahankan - kalau tidak,
 * "gabungkan sel" tak akan pernah bisa dipakai, karena menunjuk ulang satu sel
 * membubarkan seleksinya. Di luar itu cukup kursor yang dipindahkan.
 */
export function targetCell(editor: Editor, target: CellTarget, at?: number): void {
	if (selectionCoversCell(editor, target)) return
	focusCell(editor, target, at)
}

/** Jalankan perintah yang bekerja atas seleksi (gabung sel, kepala, perataan). */
export function withCellTarget(editor: Editor, target: CellTarget, run: (editor: Editor) => void): void {
	targetCell(editor, target)
	run(editor)
}

// ── operasi baris ────────────────────────────────────────────────────────

export function insertRowBefore(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addRowBefore().run()
}

export function insertRowAfter(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addRowAfter().run()
}

export function deleteRowAt(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().deleteRow().run()
}

/**
 * Terjemahkan batas sisip hasil seret (0..count) jadi indeks tujuan.
 *
 * Garis sisip diberi nomor per BATAS: batas 2 berarti "di antara baris 1 dan
 * 2". Setelah baris sumber dicabut, semua batas di sebelah kanannya bergeser
 * satu - menjatuhkan baris 0 di batas 3 mendaratkannya di indeks 2, bukan 3.
 */
export function dropIndex(fromIndex: number, boundary: number): number {
	return boundary > fromIndex ? boundary - 1 : boundary
}

/** Pindahkan baris `target.rowIndex` ke indeks `to`. */
export function moveRow(editor: Editor, target: CellTarget, to: number): void {
	const size = tableSize(editor, target.tablePos)
	if (!size || to < 0 || to >= size.rowCount || to === target.rowIndex) return
	// Perintahnya bekerja atas tabel yang memuat seleksi - arahkan dulu ke sana.
	if (!focusCell(editor, target)) return
	moveTableRow({ from: target.rowIndex, to })(editor.state, (tr) => editor.view.dispatch(tr))
}

// ── operasi kolom ────────────────────────────────────────────────────────

export function insertColBefore(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addColumnBefore().run()
}

export function insertColAfter(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().addColumnAfter().run()
}

export function deleteColAt(editor: Editor, target: CellTarget): void {
	if (!focusCell(editor, target)) return
	editor.chain().focus().deleteColumn().run()
}

/** Pindahkan kolom `target.colIndex` ke indeks `to`. */
export function moveColumn(editor: Editor, target: CellTarget, to: number): void {
	const size = tableSize(editor, target.tablePos)
	if (!size || to < 0 || to >= size.colCount || to === target.colIndex) return
	if (!focusCell(editor, target)) return
	moveTableColumn({ from: target.colIndex, to })(editor.state, (tr) => editor.view.dispatch(tr))
}

/**
 * Jadikan sel terpilih benar-benar polos: tanpa latar, tanpa bingkai, dan bukan
 * lagi sel kepala.
 *
 * Kepala tabel ikut diubah jadi sel biasa karena arsirannya datang dari CSS
 * (`th { background }`), bukan dari atribut warna - selama sebuah sel masih
 * `<th>`, berapa pun warna yang dilepas darinya ia tidak akan pernah polos.
 *
 * Bekerja pada blok sel yang disorot; kalau tidak ada blok, pada sel tempat
 * kursor berada.
 */
export function clearCellStyling(editor: Editor): boolean {
	const { state } = editor
	const cellType = state.schema.nodes.tableCell
	const headerType = state.schema.nodes.tableHeader
	if (!cellType) return false

	const positions: number[] = []
	const { selection } = state
	if (selection instanceof CellSelection) {
		selection.forEachCell((_cell, pos) => positions.push(pos))
	} else {
		const { $from } = selection
		for (let depth = $from.depth; depth > 0; depth -= 1) {
			const role = $from.node(depth).type.spec.tableRole
			if (role === 'cell' || role === 'header_cell') {
				positions.push($from.before(depth))
				break
			}
		}
	}
	if (positions.length === 0) return false

	const tr = state.tr
	for (const pos of positions) {
		const cell = tr.doc.nodeAt(pos)
		if (!cell) continue
		// Ukuran node tidak berubah, jadi posisi sel lain tetap sahih tanpa pemetaan.
		tr.setNodeMarkup(
			pos,
			headerType && cell.type === headerType ? cellType : cell.type,
			{ ...cell.attrs, backgroundColor: NO_COLOR, borderColor: NO_COLOR },
			cell.marks,
		)
	}
	if (!tr.docChanged) return false
	editor.view.dispatch(tr)
	return true
}
