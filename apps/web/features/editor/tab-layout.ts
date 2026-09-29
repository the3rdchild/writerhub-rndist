'use client'

import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { DEFAULT_TAB_PT } from './tab-node'
import type { TabStop } from './tab-stops'

/** Satu titik = 4/3 piksel CSS. */
const PX_PER_PT = 96 / 72

/**
 * Lebar satu tab, dalam piksel CSS, seperti Word menghitungnya.
 *
 * `x` adalah posisi awal tab dari tepi kiri area teks, `follow` lebar teks
 * sesudahnya sampai tab berikutnya atau akhir baris. Tab stop pertama yang
 * lebih jauh dari `x` yang dipakai:
 * - `left`: teks sesudahnya mulai di tab stop;
 * - `right`: teks sesudahnya berakhir di tab stop;
 * - `center`: teks sesudahnya berpusat di tab stop.
 * Tab stop kanan atau tengah yang tidak muat dilewati. Sesudah tab stop
 * terakhir, tab jatuh ke kelipatan 0,5 inci berikutnya.
 */
export function tabWidth(x: number, follow: number, stops: readonly TabStop[]): number {
	const sorted = [...stops].sort((a, b) => a.posPt - b.posPt)
	for (const stop of sorted) {
		const at = stop.posPt * PX_PER_PT
		if (at <= x + 0.5) continue
		const width =
			stop.type === 'right' ? at - x - follow : stop.type === 'center' ? at - x - follow / 2 : at - x
		if (width >= 0) return width
	}
	const step = DEFAULT_TAB_PT * PX_PER_PT
	return (Math.floor(x / step + 0.001) + 1) * step - x
}

function readStops(paragraph: HTMLElement): TabStop[] {
	const raw = paragraph.getAttribute('data-tab-stops')
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw) as TabStop[]
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

/** Lebar teks sesudah `tab` sampai tab berikutnya atau akhir paragraf, dalam piksel layar. */
function followingWidth(tab: HTMLElement, paragraph: HTMLElement): number {
	const range = document.createRange()
	range.setStartAfter(tab)
	let end: Node = paragraph
	for (let node = tab.nextSibling; node; node = node.nextSibling) {
		if (node instanceof HTMLElement && (node.hasAttribute('data-tab') || node.tagName === 'BR')) {
			end = node
			break
		}
	}
	if (end === paragraph) range.setEnd(paragraph, paragraph.childNodes.length)
	else range.setEndBefore(end)
	return range.getBoundingClientRect().width
}

/**
 * Mengatur lebar setiap tab di satu paragraf, berurutan: lebar tab pertama
 * menggeser posisi tab berikutnya, jadi tiap tab diukur sesudah yang
 * sebelumnya ditetapkan.
 *
 * Posisi diukur dari tepi kiri area teks induknya (halaman atau sel tabel),
 * seperti tab stop Word yang dihitung dari margin kiri. Zoom kanvas memakai
 * transform, jadi ukuran layar dibagi skalanya.
 */
function layoutParagraph(paragraph: HTMLElement): void {
	const tabs = Array.from(paragraph.querySelectorAll<HTMLElement>('[data-tab]'))
	if (tabs.length === 0) return
	const container = paragraph.parentElement ?? paragraph
	const box = container.getBoundingClientRect()
	const scale = container.offsetWidth > 0 ? box.width / container.offsetWidth : 1
	const style = getComputedStyle(container)
	const origin =
		box.left + (Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth)) * scale
	const stops = readStops(paragraph)

	for (const tab of tabs) tab.style.width = '0px'
	for (const tab of tabs) {
		const x = (tab.getBoundingClientRect().left - origin) / scale
		const follow = followingWidth(tab, paragraph) / scale
		tab.style.width = `${tabWidth(x, follow, stops)}px`
	}
}

export function layoutTabs(root: HTMLElement): void {
	const paragraphs = new Set<HTMLElement>()
	for (const tab of Array.from(root.querySelectorAll<HTMLElement>('[data-tab]'))) {
		const paragraph = tab.closest('p')
		if (paragraph) paragraphs.add(paragraph)
	}
	for (const paragraph of paragraphs) layoutParagraph(paragraph)
}

export const tabLayoutKey = new PluginKey('tabLayout')

/**
 * Menata ulang tab sesudah setiap perubahan, ukuran jendela, dan pemuatan font.
 *
 * Lebarnya ditulis langsung ke gaya node tab. NodeView tab mengabaikan mutasi
 * itu (`tab-node.ts`), jadi ProseMirror tidak menggambar ulang karenanya.
 * Cetak memakai DOM yang sama, jadi posisinya ikut ke PDF.
 */
export function tabLayoutPlugin(): Plugin {
	return new Plugin({
		key: tabLayoutKey,
		view(view: EditorView) {
			let frame = 0
			const schedule = () => {
				cancelAnimationFrame(frame)
				frame = requestAnimationFrame(() => layoutTabs(view.dom))
			}
			const now = () => layoutTabs(view.dom)
			schedule()
			window.addEventListener('resize', schedule)
			window.addEventListener('beforeprint', now)
			void document.fonts?.ready.then(schedule)
			return {
				update: schedule,
				destroy: () => {
					cancelAnimationFrame(frame)
					window.removeEventListener('resize', schedule)
					window.removeEventListener('beforeprint', now)
				},
			}
		},
	})
}
