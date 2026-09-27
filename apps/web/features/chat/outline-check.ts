import type { Node as PMNode } from '@tiptap/pm/model'
import type { ResearchBrief } from '@writer-hub/shared'
import { HTML_BLOCK } from '@/features/editor/html-block'
import { docHeadings, sameTitle, sectionIsEmpty } from './section-write'

/**
 * Naskah dibandingkan dengan kerangka dari `set_outline`, tanpa model.
 *
 * Uji use case menemukan dokumen yang "selesai" dengan label "Gambar 2" tanpa
 * gambarnya, 2 dari 4 gambar yang dijanjikan, dan 6 halaman dari target 8-12;
 * penulis baru tahu setelah membaca ulang seluruh naskah. Pemeriksaan di sini
 * deterministik dan murah, jadi ia dijalankan di setiap giliran dan hasilnya
 * dikirim ke model sekaligus ditampilkan ke penulis.
 */

export type ItemKind = 'table' | 'figure'

export interface SectionState {
	title: string
	state: 'written' | 'empty' | 'missing'
}

export interface ItemState {
	label: string
	/** Janji lengkapnya, seperti dicatat kerangka. */
	text: string
	chapter: string
	/** `caption-only`: keterangannya ada, tabel/gambarnya tidak ada di dekatnya. */
	state: 'present' | 'caption-only' | 'missing'
}

export interface OutlineProgress {
	sections: SectionState[]
	items: ItemState[]
	/** Hanya bila kerangka punya target dan panjangnya bisa diukur. */
	pages: { current: number; min: number; max: number } | null
}

const LABEL =
	/^\s*(tabel|table|gambar|grafik|diagram|bagan|chart|figure|infografis|infographic)\s+(\d+(?:\.\d+)*)/i

/** Label di awal janji kerangka: "Tabel 1: statistik …" → Tabel 1, tabel. */
export function promisedLabel(text: string): { label: string; kind: ItemKind } | null {
	const match = LABEL.exec(text)
	if (!match) return null
	const word = match[1].toLowerCase()
	return {
		label: `${word[0].toUpperCase()}${word.slice(1)} ${match[2]}`,
		kind: word === 'tabel' || word === 'table' ? 'table' : 'figure',
	}
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Blok ini keterangan label itu: dibuka labelnya, bukan "Tabel 10" untuk "Tabel 1". */
function isCaption(node: PMNode, label: string): boolean {
	return (
		node.isTextblock && new RegExp(`^\\s*${escapeRegExp(label)}(?![\\d]|\\.\\d)`, 'i').test(node.textContent)
	)
}

function holds(node: PMNode, kind: ItemKind): boolean {
	const matches = (child: PMNode) =>
		kind === 'table'
			? child.type.name === 'table'
			: child.type.name === 'image' ||
				child.type.name === HTML_BLOCK ||
				(child.type.name === 'codeBlock' && ['diagram', 'mermaid'].includes(String(child.attrs.language)))
	if (matches(node)) return true
	let found = false
	node.descendants((child) => {
		if (found) return false
		found = matches(child)
		return !found
	})
	return found
}

/*
 * Tabel atau gambar "nyata" untuk sebuah keterangan: node-nya ada dalam dua
 * blok di atas atau di bawahnya - keterangan tabel lazim di atas, keterangan
 * gambar di bawah, dan kadang satu paragraf sumber ada di antaranya.
 */
function itemState(docs: readonly PMNode[], label: string, kind: ItemKind): ItemState['state'] {
	let captioned = false
	for (const doc of docs) {
		const blocks: PMNode[] = []
		doc.forEach((node) => {
			blocks.push(node)
		})
		for (const [at, block] of blocks.entries()) {
			if (!isCaption(block, label)) continue
			captioned = true
			const near = [...blocks.slice(Math.max(0, at - 2), at), ...blocks.slice(at + 1, at + 3)]
			if (near.some((node) => holds(node, kind))) return 'present'
		}
	}
	return captioned ? 'caption-only' : 'missing'
}

/**
 * Keadaan naskah terhadap kerangka di brief. `docs` adalah semua tab dokumen -
 * CV dan surat lamaran bisa berada di tab yang berbeda. `pageCount` hanya
 * diberikan bila panjang seluruh dokumen memang terukur (satu tab).
 */
export function outlineProgress(
	docs: readonly PMNode[],
	brief: ResearchBrief,
	pageCount: number | null,
): OutlineProgress | null {
	if (brief.chapters.length === 0) return null

	const sections = brief.chapters.map((chapter): SectionState => {
		for (const doc of docs) {
			const heading = docHeadings(doc).find((candidate) => sameTitle(candidate.text, chapter.title))
			if (heading)
				return { title: chapter.title, state: sectionIsEmpty(doc, heading.index) ? 'empty' : 'written' }
		}
		return { title: chapter.title, state: 'missing' }
	})

	const items = brief.chapters.flatMap((chapter) =>
		(chapter.items ?? []).flatMap((text): ItemState[] => {
			const promised = promisedLabel(text)
			if (!promised) return []
			return [
				{
					label: promised.label,
					text,
					chapter: chapter.title,
					state: itemState(docs, promised.label, promised.kind),
				},
			]
		}),
	)

	const target = brief.plan?.pages
	const pages = target && pageCount !== null ? { current: pageCount, min: target[0], max: target[1] } : null
	return { sections, items, pages }
}

const range = ({ min, max }: { min: number; max: number }) => (min === max ? `${min}` : `${min}-${max}`)

export function outlineDone(progress: OutlineProgress): boolean {
	const lengthOk =
		!progress.pages ||
		(progress.pages.current >= progress.pages.min && progress.pages.current <= progress.pages.max)
	return (
		lengthOk &&
		progress.sections.every((section) => section.state === 'written') &&
		progress.items.every((item) => item.state === 'present')
	)
}

/** Laporan untuk model, di konteks editor setiap giliran. */
export function outlineForModel(progress: OutlineProgress): string {
	const written = progress.sections.filter((section) => section.state === 'written').length
	const titles = (state: SectionState['state']) =>
		progress.sections.filter((section) => section.state === state).map((section) => `"${section.title}"`)
	const empty = titles('empty')
	const missing = titles('missing')
	const noItem = progress.items.filter((item) => item.state === 'missing').map((item) => item.label)
	const onlyCaption = progress.items.filter((item) => item.state === 'caption-only').map((item) => item.label)

	const lines = [`${written} of ${progress.sections.length} outline sections have body text.`]
	if (empty.length > 0) lines.push(`Still empty: ${empty.join(', ')}.`)
	if (missing.length > 0) lines.push(`No heading in the document yet for: ${missing.join(', ')}.`)
	if (noItem.length > 0)
		lines.push(
			`Promised but not in the document: ${noItem.join(', ')} (no caption starting with that label).`,
		)
	if (onlyCaption.length > 0) {
		lines.push(`Captioned but with no real table or figure next to the caption: ${onlyCaption.join(', ')}.`)
	}
	if (progress.pages) {
		const { current, max, min } = progress.pages
		const target = range(progress.pages)
		if (current > max)
			lines.push(
				`Length: ${current} pages, the writer asked for ${target} - shorten existing sections, do not add.`,
			)
		else if (current < min) lines.push(`Length: ${current} pages, the writer asked for ${target}.`)
		else lines.push(`Length: ${current} pages, within the ${target} asked for.`)
	}
	if (outlineDone(progress)) lines.push('Everything in the outline is in place.')
	return lines.join(' ')
}

/** Ringkasan untuk penulis: satu baris pendek dan rinciannya. */
export function outlineForWriter(progress: OutlineProgress): { short: string; detail: string[] } {
	const empty = progress.sections
		.filter((section) => section.state !== 'written')
		.map((section) => section.title)
	const items = progress.items.filter((item) => item.state !== 'present')
	const noun = empty.every((title) => /^bab\b/i.test(title)) ? 'bab' : 'bagian'

	const short: string[] = []
	const detail: string[] = []
	if (empty.length > 0) {
		short.push(`${empty.length} ${noun} kosong`)
		detail.push(`Belum berisi: ${empty.join(', ')}`)
	}
	if (items.length > 0) {
		const labels = items.map((item) => item.label)
		short.push(
			`${labels.slice(0, 2).join(', ')}${labels.length > 2 ? ` +${labels.length - 2}` : ''} belum ada`,
		)
		detail.push(
			...items.map(
				(item) => `${item.label}: ${item.state === 'caption-only' ? 'baru keterangannya' : 'belum ada'}`,
			),
		)
	}
	const pages = progress.pages
	if (pages && (pages.current > pages.max || pages.current < pages.min)) {
		short.push(`${pages.current} dari ${range(pages)} hlm`)
		detail.push(`Panjang ${pages.current} halaman, target ${range(pages)}`)
	}
	return { short: short.join(' · '), detail }
}
