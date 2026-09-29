import type { PageNumbering, PageNumberPosition } from '@writer-hub/shared'
import { footerMarginOf, headerMarginOf, type PageSetup } from '@/features/editor/page-geometry'
import {
	type FurnitureSlot,
	type FurnitureVariant,
	PAGE_TOKEN,
	PAGES_TOKEN,
	type PageFurnitureLine,
} from './model'

/**
 * Header, footer, dan nomor halaman di kertas cetak (PDF lewat "Cetak").
 *
 * Di layar semuanya digambar per lembar di lapisan lembar - lapisan yang
 * disembunyikan saat mencetak, karena saat mencetak peramban memenggal
 * halamannya sendiri dan lembar layar tidak lagi sejajar dengan kertas. Di
 * kertas, satu-satunya tempat untuk isi yang berulang tapi berubah per halaman
 * adalah kotak margin `@page` (`@top-center`, `@bottom-right`...), dengan
 * `counter(page)` untuk nomornya.
 *
 * Yang tidak bisa dinyatakan CSS dijembatani dua cara:
 *
 * - Mulai ulang hitungan. `counter-reset` di `@page` berlaku di SETIAP halaman
 *   bernama itu, jadi tiap rangkaian penomoran mendapat penghitungnya sendiri
 *   (`wh-run-N`) yang dinaikkan satu per halaman; BAB I sesudah bagian depan
 *   romawi mulai dari 1 karena penghitungnya memang baru.
 * - Halaman pembuka bab. `@page nama:first` hanya berlaku untuk halaman
 *   pertama DOKUMEN, jadi lembar pembuka bab mendapat nama halaman sendiri
 *   (akhiran `o`, lihat `withPrintVariants` di pagination.ts); akhiran `f`
 *   menandai lembar pertama bagian yang mulai dari angka selain 1.
 *
 * Isi kaya header/footer (tebal, gambar) dicetak sebagai teks polos: kotak
 * margin hanya menerima teks.
 */

export type PrintLine = Pick<PageFurnitureLine, 'text' | 'align'>

export interface PrintFurnitureInput {
	/** Tata letak tiap nama halaman cetak; indeks 0 = bagian pertama (halaman tanpa nama). */
	sections: readonly PageSetup[]
	/** Isi header/footer efektif per slot+varian (fragmen kaya sudah jadi teks). */
	lines: Partial<Record<FurnitureSlot, Partial<Record<FurnitureVariant, PrintLine>>>>
	/** Varian ada - kosong sekalipun ("halaman pertama berbeda" tanpa isi). */
	has: (slot: FurnitureSlot, variant: FurnitureVariant) => boolean
	/** Lencana nomor cadangan menyala (pengaturan tampilan). */
	showPageNumbers: boolean
	fontFamily: string
}

const SLOTS: readonly FurnitureSlot[] = ['header', 'footer']
const BOXES = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const
type Box = (typeof BOXES)[number]

const SUFFIXES = ['', 'o', 'f', 'fo'] as const

const mm = (px: number) => `${Math.round((px / 96) * 25.4 * 100) / 100}mm`

/** Teks untuk `content`: tanda kutip dan garis miring terbalik di-escape, baris baru jadi \A. */
function quoted(text: string): string {
	return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`
}

/** Teks perabot → nilai `content`, dengan {page}/{pages} menjadi penghitung. */
function contentOf(text: string, pageCounter: string | null): string[] {
	return text
		.split(new RegExp(`(${PAGE_TOKEN}|${PAGES_TOKEN})`))
		.filter(Boolean)
		.map((piece) =>
			piece === PAGE_TOKEN ? (pageCounter ?? '""') : piece === PAGES_TOKEN ? 'counter(pages)' : quoted(piece),
		)
}

const carriesNumber = (text: string | undefined) =>
	Boolean(text && (text.includes(PAGE_TOKEN) || text.includes(PAGES_TOKEN)))

/** Penghitung tiap bagian: bagian yang melanjutkan memakai penghitung bagian sebelumnya. */
function runsOf(sections: readonly PageSetup[]): number[] {
	const runs: number[] = []
	sections.forEach((setup, index) => {
		const restarts = typeof setup.pageNumbering?.restart === 'number'
		runs.push(index === 0 || restarts ? index : runs[index - 1])
	})
	return runs
}

type PageKind = 'default' | 'first' | 'even'

/*
 * Varian perabot untuk satu slot di satu jenis halaman - aturan yang sama
 * dengan `variantFor` di layar: halaman pertama memakai `first` bila ada,
 * halaman genap memakai `even` bila ada.
 */
function variantFor(kind: PageKind, slot: FurnitureSlot, has: PrintFurnitureInput['has']): FurnitureVariant {
	if (kind === 'first' && has(slot, 'first')) return 'first'
	if (kind === 'even' && has(slot, 'even')) return 'even'
	return 'default'
}

function boxOf(slot: FurnitureSlot, align: PageFurnitureLine['align']): Box {
	return `${slot === 'header' ? 'top' : 'bottom'}-${align}` as Box
}

function boxRules(boxes: Map<Box, string[]>, setup: PageSetup, input: PrintFurnitureInput): string {
	return BOXES.map((box) => {
		const parts = boxes.get(box)
		if (!parts || parts.length === 0) return `@${box} { content: none; }`
		const top = box.startsWith('top')
		const edge = top
			? `vertical-align: top; padding-top: ${mm(headerMarginOf(setup))};`
			: `vertical-align: bottom; padding-bottom: ${mm(footerMarginOf(setup))};`
		const align = box.endsWith('left') ? 'left' : box.endsWith('right') ? 'right' : 'center'
		return `@${box} { content: ${parts.join(' ')}; ${edge} text-align: ${align}; white-space: pre; font-family: ${input.fontFamily}; font-size: 10pt; color: #000; }`
	}).join(' ')
}

/** Isi keenam kotak margin untuk satu jenis halaman di satu nama halaman. */
function pageBoxes(
	input: PrintFurnitureInput,
	rule: PageNumbering | undefined,
	counter: string,
	kind: PageKind,
	opening: boolean,
): Map<Box, string[]> {
	const boxes = new Map<Box, string[]>()
	const push = (box: Box, parts: string[]) => {
		const current = boxes.get(box)
		boxes.set(box, current ? [...current, '"\\A"', ...parts] : parts)
	}

	const hidden = rule?.show === false
	const firstSeparate = kind === 'first' && SLOTS.some((slot) => input.has(slot, 'first'))
	let furnitureNumbered = false

	for (const slot of SLOTS) {
		const line = input.lines[slot]?.[variantFor(kind, slot, input.has)]
		if (!line?.text.trim()) continue
		furnitureNumbered ||= carriesNumber(line.text)
		push(boxOf(slot, line.align), contentOf(line.text, hidden ? null : counter))
	}

	// Sama dengan layar: perabot yang membawa nomornya sendiri menang, sampul tanpa nomor.
	if (hidden || furnitureNumbered || firstSeparate) return boxes
	const position: PageNumberPosition | null =
		(opening ? rule?.openingPosition : undefined) ?? rule?.position ?? null
	if (position) push(position, [counter])
	else if (input.showPageNumbers) push('bottom-right', [counter])
	return boxes
}

/** Aturan `@page` pembawa header, footer, dan nomor halaman untuk dicetak. */
export function printFurnitureRules(input: PrintFurnitureInput): string {
	const { sections } = input
	if (sections.length === 0) return ''
	const runs = runsOf(sections)
	const even = SLOTS.some((slot) => input.has(slot, 'even'))
	const rules: string[] = []

	sections.forEach((setup, index) => {
		const rule = setup.pageNumbering
		const counterName = `wh-run-${runs[index]}`
		const counter = `counter(${counterName}, ${rule?.format ?? 'decimal'})`

		for (const suffix of SUFFIXES) {
			// Bagian pertama tanpa akhiran adalah halaman tanpa nama: aturan `@page` polos.
			const name = index === 0 && suffix === '' ? '' : ` sec${index}${suffix}`
			const opening = suffix.includes('o')
			const step = suffix.includes('f') && typeof rule?.restart === 'number' ? Math.max(0, rule.restart) : 1

			rules.push(
				`@page${name} { counter-increment: ${counterName} ${step}; ${boxRules(pageBoxes(input, rule, counter, 'default', opening), setup, input)} }`,
			)
			if (even) {
				rules.push(
					`@page${name}:left { ${boxRules(pageBoxes(input, rule, counter, 'even', opening), setup, input)} }`,
				)
			}
			// Halaman pertama dokumen selalu milik bagian pertama.
			if (index === 0) {
				rules.push(
					`@page${name}:first { ${boxRules(pageBoxes(input, rule, counter, 'first', opening), setup, input)} }`,
				)
			}
		}
	})

	// Flyer satu halaman tanpa margin: tidak ada tempat untuk perabot.
	rules.push(`@page flyer { ${BOXES.map((box) => `@${box} { content: none; }`).join(' ')} }`)
	return rules.join('\n')
}
