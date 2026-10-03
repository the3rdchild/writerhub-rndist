import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { TabStop, TabStopType } from './tab-stops'

/*
 * Tab stop dari penggaris (TKS-18), seperti Word: klik di penggaris menambah
 * tab stop kiri, menyeret penandanya memindahkan, menyeretnya keluar dari
 * penggaris membuangnya, dan klik ganda mengganti jenisnya. Hitungannya di
 * sini - murni, dalam pt dari tepi kiri area teks (margin kiri, atau tepi
 * kiri kolom di wilayah berkolom), satuan atribut `tabStops`.
 */

export const PX_PER_PT = 96 / 72

/** Dua tab stop sedekat ini dianggap satu: menambah di sana menggantikannya. */
const SAME_STOP_PT = 2

const roundPt = (value: number) => Math.round(value * 100) / 100

function sorted(stops: readonly TabStop[]): TabStop[] {
	return [...stops].sort((a, b) => a.posPt - b.posPt)
}

/** Tab stop baru di `posPt` (yang terlalu dekat dengannya diganti). */
export function addTabStop(stops: readonly TabStop[], posPt: number, type: TabStopType = 'left'): TabStop[] {
	const at = roundPt(Math.max(0, posPt))
	return sorted([...stops.filter((stop) => Math.abs(stop.posPt - at) > SAME_STOP_PT), { posPt: at, type }])
}

/** Tab stop di `fromPt` dipindah ke `toPt`, jenisnya tetap. */
export function moveTabStop(stops: readonly TabStop[], fromPt: number, toPt: number): TabStop[] {
	const moving = stops.find((stop) => Math.abs(stop.posPt - fromPt) < 0.5)
	if (!moving) return [...stops]
	const rest = stops.filter((stop) => stop !== moving)
	return addTabStop(rest, toPt, moving.type)
}

export function removeTabStop(stops: readonly TabStop[], atPt: number): TabStop[] {
	return stops.filter((stop) => Math.abs(stop.posPt - atPt) >= 0.5)
}

const NEXT_TYPE: Record<TabStopType, TabStopType> = { left: 'center', center: 'right', right: 'left' }

/** Jenis tab stop di `atPt` digilir: kiri → tengah → kanan → kiri. */
export function cycleTabStop(stops: readonly TabStop[], atPt: number): TabStop[] {
	return stops.map((stop) =>
		Math.abs(stop.posPt - atPt) < 0.5 ? { ...stop, type: NEXT_TYPE[stop.type] } : stop,
	)
}

/** Paragraf yang disentuh seleksi (posisi dan node-nya), berurutan. */
export function selectedParagraphs(state: EditorState): { pos: number; node: PMNode }[] {
	const { from, to, $from } = state.selection
	const found: { pos: number; node: PMNode }[] = []
	state.doc.nodesBetween(from, Math.max(to, from), (node, pos) => {
		if (node.type.name === 'paragraph') {
			found.push({ pos, node })
			return false
		}
		return true
	})
	if (found.length > 0) return found
	/* Seleksi node (gambar dll.) tidak menyentuh paragraf mana pun. */
	for (let depth = $from.depth; depth > 0; depth -= 1) {
		const node = $from.node(depth)
		if (node.type.name === 'paragraph') return [{ pos: $from.before(depth), node }]
	}
	return []
}

/** Tab stop paragraf pertama di seleksi - yang ditampilkan penggaris. */
export function tabStopsAt(state: EditorState): TabStop[] {
	const first = selectedParagraphs(state)[0]
	const stops = first?.node.attrs.tabStops as TabStop[] | null | undefined
	return Array.isArray(stops) ? sorted(stops) : []
}

/**
 * Menerapkan perubahan tab stop ke tiap paragraf yang disentuh seleksi -
 * per paragraf, jadi tab stop lain yang berbeda antarparagraf tidak ikut
 * tertimpa. Mengembalikan false bila tidak ada paragraf.
 */
export function updateTabStops(
	state: EditorState,
	dispatch: ((tr: Transaction) => void) | undefined,
	change: (stops: TabStop[]) => TabStop[],
): boolean {
	const paragraphs = selectedParagraphs(state)
	if (paragraphs.length === 0) return false
	if (!dispatch) return true
	const tr = state.tr
	for (const { pos, node } of paragraphs) {
		const current = Array.isArray(node.attrs.tabStops) ? (node.attrs.tabStops as TabStop[]) : []
		const next = change(current)
		tr.setNodeAttribute(pos, 'tabStops', next.length > 0 ? next : null)
	}
	dispatch(tr)
	return true
}
