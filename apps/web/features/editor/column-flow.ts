import type { PageGeometry } from './page-geometry'

export interface ColumnItem {
	pos: number
	height: number
	marginTop: number
	marginBottom: number
	keepWithNext: boolean
	span?: boolean
	table?: ColumnTable
	isBreak?: boolean
	/** Pindah kolom (`w:br w:type="column"`): lanjut di kolom berikutnya. */
	columnBreak?: boolean
}

export interface ColumnTable {
	rows: readonly { pos: number; top: number; height: number }[]
	columns: number
	header?: { pos: number; height: number }
}

export interface TableCut {
	pos: number
	spacerHeight: number
	headerHeight: number
	headerPos?: number
	columns: number
}

export interface ColumnFrame {
	top: number
	count: number
	columnWidth: number
	columnGap: number
	columns?: readonly { left: number; width: number }[]
	sheetOrigin?: number
}

/**
 * Lebar & posisi tiap kolom.
 *
 * `gaps` adalah jarak PER CELAH (panjang `count - 1`), bentuk yang dipakai Word
 * lewat `w:col/@w:space`: tiap kolom membawa jarak ke tetangga kanannya
 * sendiri, dan templat berkolom tak-sama hampir selalu memakainya. Tanpa
 * `gaps`, `gap` tunggal berlaku untuk semua celah - perilaku lama.
 */
export function resolveColumnSlots(
	width: number,
	count: number,
	gap: number,
	widths: readonly number[] | null,
	gaps: readonly number[] | null = null,
): { left: number; width: number }[] {
	const usable = gaps && gaps.length === count - 1 && gaps.every((value) => value >= 0) ? gaps : null
	const gapBefore = (index: number) => (index <= 0 ? 0 : usable ? usable[index - 1] : gap)
	const total = Array.from({ length: count }, (_, index) => gapBefore(index)).reduce((a, b) => a + b, 0)
	const natural = width - total
	if (!(natural > 0) || count < 1) return []

	if (!widths || widths.length !== count || widths.some((value) => !(value > 0))) {
		const columnWidth = natural / count
		let even = 0
		return Array.from({ length: count }, (_, index) => {
			even += gapBefore(index)
			const slot = { left: even, width: columnWidth }
			even += columnWidth
			return slot
		})
	}

	const sum = widths.reduce((total, value) => total + value, 0)
	const scale = sum > 0 ? natural / sum : 1
	let left = 0
	return widths.map((value, index) => {
		left += gapBefore(index)
		const slot = { left, width: value * scale }
		left += slot.width
		return slot
	})
}

export interface ColumnPlacement {
	pos: number
	top: number
	left: number
	width: number
	cuts?: readonly TableCut[]
	span?: boolean
}

export interface ColumnFlow {
	placements: ColumnPlacement[]
	height: number
	sheetGap: number
}

export function flowColumns(
	items: readonly ColumnItem[],
	{ top, count, columnWidth, columnGap, columns, sheetOrigin = 0 }: ColumnFrame,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): ColumnFlow {
	if (items.length === 0 || count < 1 || contentHeight <= 0) {
		return { placements: [], height: 0, sheetGap: 0 }
	}

	const sheetTop = (page: number) => sheetOrigin + page * pageStride
	const sheetBottom = (page: number) => sheetOrigin + page * pageStride + contentHeight
	let page = Math.max(0, Math.floor((top - sheetOrigin) / pageStride))
	if (top >= sheetBottom(page)) page += 1

	const firstPage = page
	const firstTop = Math.max(top, sheetTop(firstPage))
	const regionTop = (sheet: number) => (sheet === firstPage ? firstTop : sheetTop(sheet))
	const regionHeight = (sheet: number) => sheetBottom(sheet) - regionTop(sheet)

	const slots: {
		page: number
		column: number
		top: number
		height: number
		cuts?: readonly TableCut[]
		span?: boolean
	}[] = []
	const blockedUntil: number[] = Array.from({ length: count }, () => 0)
	let column = 0

	const advance = () => {
		column += 1
		if (column >= count) {
			column = 0
			page += 1
		}
	}
	const placeSpanner = (item: ColumnItem) => {
		let water = firstTop
		for (const slot of slots) water = Math.max(water, slot.top + slot.height)
		for (const until of blockedUntil) water = Math.max(water, until)

		let spanPage = Math.floor(water / pageStride)
		if (water >= sheetBottom(spanPage)) spanPage += 1
		let spanTop = Math.max(water, sheetTop(spanPage))
		if (spanTop + item.height > sheetBottom(spanPage) + 0.5 && spanTop > sheetTop(spanPage) + 0.5) {
			spanPage += 1
			spanTop = sheetTop(spanPage)
		}

		const bottom = spanTop + item.height
		slots.push({ page: spanPage, column: 0, top: spanTop, height: item.height, span: true })
		blockedUntil.fill(bottom)
		page = Math.floor(bottom / pageStride)
		if (bottom >= sheetBottom(page)) page += 1
		column = 0
	}
	const breakPage = () => {
		page += 1
		column = 0
	}

	let index = 0
	while (index < items.length) {
		if (items[index].span) {
			placeSpanner(items[index])
			index += 1
			continue
		}
		if (items[index].columnBreak) {
			/*
			 * Pindah kolom menutup kolom berjalan, bukan lembarnya.
			 *
			 * Ia tetap mendapat slot bertinggi nol supaya `placements` sejajar
			 * dengan `items` - pemetaan indeks-ke-indeks yang dipegang seluruh
			 * pemanggil. Yang TIDAK dilakukannya: memanggil `advance()` sekali
			 * lagi. Isi sebelum pemenggal sudah memajukan kolom di ujung
			 * putaran, jadi pemenggal ini mendarat di kolom yang masih kosong -
			 * memajukannya lagi berarti melompati satu kolom penuh. Kolom yang
			 * SUDAH terisi (mis. dua pemenggal beruntun) memang harus dilompati,
			 * dan di sanalah `advance()` dipanggil; di kolom terakhir
			 * `advance()` sendiri yang berpindah lembar, persis seperti Word.
			 */
			const fresh = !slots.some((slot) => slot.page === page && slot.column === column)
			const base = Math.max(regionTop(page), blockedUntil[column])
			slots.push({ page, column, top: base, height: 0 })
			index += 1
			if (!fresh) advance()
			continue
		}
		if (items[index].isBreak) {
			const fresh = column === 0 && !slots.some((slot) => slot.page === page && slot.height > 0)
			const base = Math.max(regionTop(page), blockedUntil[column])
			slots.push({ page, column, top: base, height: 0 })
			index += 1
			if (!fresh) breakPage()
			continue
		}

		const base = Math.max(regionTop(page), blockedUntil[column])
		const limit = sheetBottom(page) - base
		let tops = packColumn(items, index, limit)
		let giant = false

		if (tops.length === 0) {
			if (limit < contentHeight - 0.5) {
				advance()
				continue
			}
			if (!items[index].table) {
				placeSpanner(items[index])
				index += 1
				continue
			}
			tops = [0]
			giant = true
		}

		for (const [offsetIndex, offset] of tops.entries()) {
			const item = items[index + offsetIndex]
			const slot: (typeof slots)[number] = { page, column, top: base + offset, height: item.height }
			if (giant && item.table) {
				const cut = cutTableRows(item.table, slot.top - sheetOrigin, page, { contentHeight, pageStride })
				slot.height = cut.bottom + sheetOrigin - slot.top
				if (cut.cuts.length > 0) slot.cuts = cut.cuts
				blockedUntil[column] = cut.bottom + sheetOrigin
			}
			slots.push(slot)
		}
		index += tops.length

		if (index < items.length) advance()
	}
	const lastPage = page
	const spillOnLastPage = blockedUntil.some((until) => until > regionTop(lastPage) + 0.5)
	const spanOnLastPage = slots.some((slot) => slot.page === lastPage && slot.span)
	const firstOnLastPage = slots.findIndex((slot) => slot.page === lastPage)
	if (firstOnLastPage >= 0 && !spillOnLastPage && !spanOnLastPage) {
		const balanced = balanceColumns(items.slice(firstOnLastPage), regionHeight(lastPage), count)
		if (balanced) {
			const base = regionTop(lastPage)
			balanced.forEach((placement, offset) => {
				slots[firstOnLastPage + offset] = {
					page: lastPage,
					column: placement.column,
					top: base + placement.top,
					height: items[firstOnLastPage + offset].height,
				}
			})
		}
	}
	let bottom = firstTop
	for (const slot of slots) {
		bottom = Math.max(bottom, slot.top + slot.height)
	}
	const sheets = Math.max(0, Math.ceil((bottom - sheetBottom(firstPage)) / pageStride))

	return {
		placements: items.map((item, i) => ({
			pos: item.pos,
			top: slots[i].top - top,
			left: columns?.[slots[i].column]?.left ?? slots[i].column * (columnWidth + columnGap),
			width: columns?.[slots[i].column]?.width ?? columnWidth,
			cuts: slots[i].cuts,
			span: slots[i].span,
		})),
		height: Math.max(0, bottom - top),
		sheetGap: firstTop - top + sheets * (pageStride - contentHeight),
	}
}

export function cutTableRows(
	table: ColumnTable,
	base: number,
	page: number,
	{ contentHeight, pageStride }: Pick<PageGeometry, 'contentHeight' | 'pageStride'>,
): { cuts: TableCut[]; bottom: number } {
	const sheetTop = (p: number) => p * pageStride
	const sheetBottom = (p: number) => p * pageStride + contentHeight
	const headerHeight = table.header?.height ?? 0

	const cuts: TableCut[] = []
	let shift = 0
	let sheet = page

	for (const row of table.rows) {
		const top = base + shift + row.top
		while (top >= sheetTop(sheet + 1) - 0.5) sheet += 1
		if (top + row.height <= sheetBottom(sheet) + 0.5) continue
		if (top <= sheetTop(sheet) + 0.5) {
			continue
		}

		const target = sheetTop(sheet + 1)
		const spacerHeight = target - top
		cuts.push({
			pos: row.pos,
			spacerHeight,
			headerHeight,
			headerPos: headerHeight > 0 ? table.header?.pos : undefined,
			columns: table.columns,
		})
		shift += spacerHeight + headerHeight
		sheet += 1
	}

	const lastRow = table.rows[table.rows.length - 1]
	const bottom = lastRow ? base + shift + lastRow.top + lastRow.height : base
	return { cuts, bottom }
}

function packColumn(items: readonly ColumnItem[], from: number, limit: number): number[] {
	const tops: number[] = []
	let y = 0
	let previousBottom = 0

	for (let i = from; i < items.length; i++) {
		const item = items[i]
		if (item.span) break
		if (item.isBreak || item.columnBreak) break
		const spacing = i === from ? 0 : Math.max(previousBottom, item.marginTop)
		if (y + spacing + item.height > limit + 0.5) break

		const next = items[i + 1]
		if (item.keepWithNext && next && i > from) {
			const after = y + spacing + item.height
			if (after + Math.max(item.marginBottom, next.marginTop) + next.height > limit + 0.5) break
		}

		tops.push(y + spacing)
		y += spacing + item.height
		previousBottom = item.marginBottom
	}

	return tops
}

function balanceColumns(
	items: readonly ColumnItem[],
	limit: number,
	count: number,
): { column: number; top: number }[] | null {
	let best = fillColumns(items, limit, count)
	if (!best) return null

	let low = 0
	let high = limit
	while (high - low > 1) {
		const middle = (low + high) / 2
		const attempt = fillColumns(items, middle, count)
		if (attempt) {
			best = attempt
			high = middle
		} else {
			low = middle
		}
	}

	return best
}

function fillColumns(
	items: readonly ColumnItem[],
	limit: number,
	count: number,
): { column: number; top: number }[] | null {
	const placements: { column: number; top: number }[] = []
	let index = 0

	for (let column = 0; column < count && index < items.length; column++) {
		const tops = packColumn(items, index, limit)
		if (tops.length === 0) return null
		for (const top of tops) placements.push({ column, top })
		index += tops.length
	}

	return index === items.length ? placements : null
}
