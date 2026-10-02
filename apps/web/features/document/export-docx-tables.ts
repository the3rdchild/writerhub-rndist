import type { Node as PMNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'

/**
 * Kisi kolom tabel untuk DOCX: `w:gridCol`, `w:tcW`, dan `w:tblW` dari satu
 * sumber, supaya ketiganya tidak bisa saling bertentangan (TBL-6, TBL-7).
 *
 * Dulu lebar kolom hanya dibaca dari baris pertama, dan satu kolom tanpa
 * `colwidth` (kolom baru dari tombol +) membuat SEMUA lebar dibagi rata;
 * `tblW` diambil dari "Lebar tabel" sementara `gridCol` dari lebar halaman,
 * dan indentasi tabel tidak mengurangi ruang sehingga tabel menembus margin.
 */

/** Lebar terkecil yang masih masuk akal untuk satu kolom, px. */
const MIN_COLUMN_PX = 24

const TWIPS_PER_PX = 15

export interface CellPlacement {
	/** Kolom kisi pertama yang ditempati sel. */
	left: number
	/** Jumlah kolom kisi yang ditempati. */
	span: number
}

export interface TableGrid {
	/** Lebar tiap kolom kisi, twip. Jumlahnya adalah lebar tabel. */
	columns: number[]
	/** Letak tiap sel, per baris, dalam urutan `row.forEach`. */
	rows: CellPlacement[][]
}

/**
 * Letak sel di kisi, termasuk kolom yang ditempati rowspan dari baris di
 * atasnya (`TableMap`). Tabel cacat yang petanya gagal dibangun jatuh ke
 * hitungan sederhana per baris.
 */
function placements(table: PMNode): { width: number; rows: CellPlacement[][] } {
	try {
		const map = TableMap.get(table)
		const rows: CellPlacement[][] = []
		table.forEach((row, rowOffset) => {
			const cells: CellPlacement[] = []
			row.forEach((_, cellOffset) => {
				const rect = map.findCell(rowOffset + 1 + cellOffset)
				cells.push({ left: rect.left, span: Math.max(1, rect.right - rect.left) })
			})
			rows.push(cells)
		})
		return { width: map.width, rows }
	} catch {
		const rows: CellPlacement[][] = []
		let width = 0
		table.forEach((row) => {
			const cells: CellPlacement[] = []
			let column = 0
			row.forEach((cell) => {
				const span = Math.max(1, Number(cell.attrs.colspan) || 1)
				cells.push({ left: column, span })
				column += span
			})
			width = Math.max(width, column)
			rows.push(cells)
		})
		return { width, rows }
	}
}

/** `colwidth` yang tersimpan per kolom kisi; `null` untuk kolom tanpa lebar. */
function storedWidths(table: PMNode, width: number, rows: CellPlacement[][]): (number | null)[] {
	const widths: (number | null)[] = Array.from({ length: width }, () => null)
	// Sel satu kolom lebih dulu - lebarnya paling bisa dipercaya - lalu sel gabungan.
	for (const singleOnly of [true, false]) {
		let rowIndex = 0
		table.forEach((row) => {
			let cellIndex = 0
			row.forEach((cell) => {
				const place = rows[rowIndex]?.[cellIndex]
				cellIndex += 1
				if (!place || (singleOnly && place.span !== 1)) return
				const colwidth = cell.attrs.colwidth as number[] | null | undefined
				for (let offset = 0; offset < place.span; offset += 1) {
					const value = Number(colwidth?.[offset])
					const column = place.left + offset
					if (column < width && widths[column] === null && value > 0) widths[column] = value
				}
			})
			rowIndex += 1
		})
	}
	return widths
}

/**
 * Kisi kolom tabel dalam twip.
 *
 * - `available`: lebar area teks yang tersedia (kolom section, sel induk),
 *   sudah dikurangi indentasi tabel - tabel tidak boleh melewatinya.
 * - Kolom tanpa lebar berbagi sisa lebar, seperti di kanvas (`[195,65,130,∅]`
 *   di area 602 px menjadi `[195,65,130,212]`). Bila sisanya tidak cukup, semua
 *   kolom diperkecil bersama.
 * - "Lebar tabel" (`tableWidth`) dipatuhi dengan menskalakan kolom.
 * - Tabel yang semua kolomnya berlebar dan muat dipakai apa adanya.
 */
export function tableGrid(table: PMNode, available: number): TableGrid {
	const { width, rows } = placements(table)
	const room = Math.max(MIN_COLUMN_PX, available)
	if (width === 0) return { columns: [Math.round(room * TWIPS_PER_PX)], rows }

	const stored = storedWidths(table, width, rows)
	const known = stored.filter((value): value is number => value !== null)
	const knownSum = known.reduce((sum, value) => sum + value, 0)
	const unknown = width - known.length
	const tableWidth = Number(table.attrs.tableWidth) || 0

	const target = tableWidth > 0 ? Math.min(tableWidth, room) : unknown === 0 ? Math.min(knownSum, room) : room

	let columns: number[]
	if (unknown > 0) {
		const share = (target - knownSum) / unknown
		const fill = share >= MIN_COLUMN_PX ? share : Math.max(MIN_COLUMN_PX, target / width)
		columns = stored.map((value) => value ?? fill)
	} else {
		columns = stored as number[]
	}

	const sum = columns.reduce((total, value) => total + value, 0)
	if (sum > 0 && Math.abs(sum - target) > 0.5) columns = columns.map((value) => (value * target) / sum)

	// Dibulatkan secara kumulatif: jumlah twip kolom sama persis dengan lebar tabel.
	const twips: number[] = []
	let edge = 0
	let previous = 0
	for (const value of columns) {
		edge += value
		const next = Math.round(edge * TWIPS_PER_PX)
		twips.push(Math.max(1, next - previous))
		previous = next
	}
	return { columns: twips, rows }
}

/** Lebar sel dalam twip: jumlah kolom kisi yang ditempatinya. */
export function cellTwips(grid: TableGrid, place: CellPlacement): number {
	return grid.columns.slice(place.left, place.left + place.span).reduce((sum, value) => sum + value, 0)
}
