import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { type PageGeometry, pageGeometry } from './page-geometry'

export const paginationKey = new PluginKey<PaginationState>('pagination')

interface Spacer {
	/** Posisi ProseMirror dari blok yang didorong ke halaman berikutnya. */
	pos: number
	height: number
}

interface Measurement {
	pos: number
	top: number
	bottom: number
}

interface PaginationState {
	spacers: Spacer[]
	decorations: DecorationSet
	pageCount: number
}

export interface PaginationOptions {
	geometry: PageGeometry
	onPageCountChange?: (pageCount: number) => void
}

/**
 * Ukur tiap blok tingkat atas pada koordinat "alami" — posisi seandainya tidak
 * ada spacer sama sekali.
 *
 * Ini kunci agar perhitungan stabil. Mengukur `offsetTop` apa adanya membuat
 * hasilnya bergantung pada spacer yang baru saja disisipkan, sehingga
 * perhitungan berikutnya berbeda lagi dan editor terjebak reflow tanpa henti.
 * Karena tinggi tiap spacer kita sendiri yang menentukan, posisi alami bisa
 * dipulihkan dengan mengurangi total spacer yang mendahuluinya — dan
 * penggabungan margin antar blok tetap terhitung benar.
 */
function measureBlocks(view: EditorView, spacers: readonly Spacer[]): Measurement[] {
	const spacerHeightAt = new Map(spacers.map((spacer) => [spacer.pos, spacer.height]))
	const measurements: Measurement[] = []
	let cumulativeSpacer = 0

	view.state.doc.forEach((_node, offset) => {
		cumulativeSpacer += spacerHeightAt.get(offset) ?? 0

		const dom = view.nodeDOM(offset)
		if (!(dom instanceof HTMLElement)) return

		// offsetTop/offsetHeight adalah nilai layout, tidak terpengaruh transform,
		// jadi hasilnya sama berapa pun tingkat zoom yang sedang dipakai.
		const top = dom.offsetTop - cumulativeSpacer
		measurements.push({ pos: offset, top, bottom: top + dom.offsetHeight })
	})

	return measurements
}

/** Tentukan di mana halaman dipenggal — murni aritmetika atas hasil pengukuran. */
function computeSpacers(
	blocks: readonly Measurement[],
	{ contentHeight, margin, gap }: PageGeometry,
): { spacers: Spacer[]; pageCount: number } {
	const spacers: Spacer[] = []
	let pageStart = 0
	let pageCount = 1

	for (const block of blocks) {
		const isFirstOnPage = block.top <= pageStart + 0.5
		const overflows = block.bottom > pageStart + contentHeight

		if (overflows && !isFirstOnPage) {
			// Dorong blok ke awal halaman berikutnya: sisa ruang halaman ini,
			// lalu margin bawah + celah antar lembar + margin atas.
			const remaining = pageStart + contentHeight - block.top
			spacers.push({ pos: block.pos, height: remaining + margin + gap + margin })
			pageStart = block.top
			pageCount += 1
		}

		// Blok yang sendirian saja lebih tinggi dari satu halaman tidak bisa
		// dipenggal tanpa memecah node, jadi ia dibiarkan meluber. Batas halaman
		// tetap dimajukan supaya blok sesudahnya tidak salah hitung.
		while (block.bottom > pageStart + contentHeight) {
			pageStart += contentHeight
			pageCount += 1
		}
	}

	return { spacers, pageCount }
}

function sameSpacers(a: readonly Spacer[], b: readonly Spacer[]): boolean {
	return (
		a.length === b.length &&
		a.every((spacer, index) => {
			const other = b[index]
			return spacer.pos === other.pos && Math.abs(spacer.height - other.height) < 1
		})
	)
}

function buildDecorations(doc: PMNode, spacers: readonly Spacer[]): DecorationSet {
	return DecorationSet.create(
		doc,
		spacers.map((spacer) =>
			Decoration.widget(
				spacer.pos,
				() => {
					const element = document.createElement('div')
					element.className = 'page-break-spacer'
					element.style.height = `${spacer.height}px`
					element.setAttribute('aria-hidden', 'true')
					return element
				},
				{ side: -1, key: `page-break-${spacer.pos}-${Math.round(spacer.height)}` },
			),
		),
	)
}

/**
 * Menyisipkan jarak sehingga teks tidak pernah terpotong batas lembar.
 *
 * Dikerjakan lewat dekorasi, bukan node dokumen, agar pemenggalan halaman tidak
 * ikut tersimpan sebagai isi draf dan tidak mengganggu pemetaan offset yang
 * dipakai sorotan grammar.
 *
 * Batasan yang diketahui: satu blok yang lebih tinggi dari satu halaman penuh
 * (misalnya tabel raksasa) tetap meluber melewati batas lembar — memecahnya
 * butuh membelah node, bukan sekadar memberi jarak.
 */
export const Pagination = Extension.create<PaginationOptions>({
	name: 'pagination',

	addOptions() {
		return { geometry: pageGeometry() }
	},

	addProseMirrorPlugins() {
		const { geometry, onPageCountChange } = this.options

		return [
			new Plugin<PaginationState>({
				key: paginationKey,

				state: {
					init: () => ({ spacers: [], decorations: DecorationSet.empty, pageCount: 1 }),

					apply(tr, current, _old, newState) {
						const incoming = tr.getMeta(paginationKey) as
							| { spacers: Spacer[]; pageCount: number }
							| undefined

						if (incoming) {
							return {
								spacers: incoming.spacers,
								pageCount: incoming.pageCount,
								decorations: buildDecorations(newState.doc, incoming.spacers),
							}
						}

						// Dekorasi lama dipetakan ke dokumen baru supaya tidak berkedip
						// selama menunggu pengukuran berikutnya.
						if (tr.docChanged) {
							return { ...current, decorations: current.decorations.map(tr.mapping, tr.doc) }
						}
						return current
					},
				},

				props: {
					decorations: (state) => paginationKey.getState(state)?.decorations,
				},

				view(view) {
					let frame = 0
					let reportedPageCount = 0

					const recalculate = () => {
						frame = 0
						const state = paginationKey.getState(view.state)
						if (!state) return

						const blocks = measureBlocks(view, state.spacers)
						const { spacers, pageCount } = computeSpacers(blocks, geometry)

						// Koordinat alami stabil, jadi perhitungan kedua atas dokumen yang
						// sama menghasilkan spacer identik — di sinilah loop berhenti.
						if (!sameSpacers(spacers, state.spacers) || pageCount !== state.pageCount) {
							const transaction = view.state.tr.setMeta(paginationKey, { spacers, pageCount })
							transaction.setMeta('addToHistory', false)
							view.dispatch(transaction)
						}

						if (pageCount !== reportedPageCount) {
							reportedPageCount = pageCount
							onPageCountChange?.(pageCount)
						}
					}

					const schedule = () => {
						if (frame) return
						frame = requestAnimationFrame(recalculate)
					}

					schedule()

					// Perubahan ukuran font atau lebar ikut mengubah tinggi blok.
					const observer = new ResizeObserver(schedule)
					observer.observe(view.dom)

					return {
						update: (_updatedView, previous) => {
							if (!previous.doc.eq(view.state.doc)) schedule()
						},
						destroy: () => {
							if (frame) cancelAnimationFrame(frame)
							observer.disconnect()
						},
					}
				},
			}),
		]
	},
})
