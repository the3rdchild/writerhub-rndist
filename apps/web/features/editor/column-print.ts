import type { EditorView } from '@tiptap/pm/view'
import { detachedCopy, type RegionPlan } from './column-render'
import { PAGE_BREAK_NODE } from './page-break'
import { REGION_SPACE_ATTRIBUTE } from './pagination'

/*
 * Wilayah berkolom di kertas (KOL-1).
 *
 * Di layar tiap blok wilayah diposisikan mutlak dan dipangkas per baris. Di
 * kertas peramban sendiri yang memenggal halaman, jadi tata letak layar tidak
 * bisa dipakai - dan wilayah section tidak punya pembungkus tempat CSS
 * multi-kolom bisa dipasang. Sesaat sebelum mencetak (`beforeprint`, yang juga
 * dipicu `page.pdf()` perender ekspor) dibuat SALINAN CETAK: salinan blok-blok
 * wilayah di dalam penjaga ruangnya, dibungkus wadah ber-`column-count`.
 * Peramban lalu mengalirkannya per baris dari kolom ke kolom dan dari halaman
 * ke halaman, menyeimbangkan kolom di ujung wilayah - aturan yang sama dengan
 * kanvas (`flowColumns`). CSS cetak menyembunyikan blok asli dan salinan
 * layar selama salinan cetak ada, jadi tidak ada isi ganda; sesudah
 * `afterprint` salinannya dibuang.
 *
 * Batasan: CSS multi-kolom hanya mengenal kolom sama lebar, jadi kolom
 * tak-sama tercetak sama lebar (jaraknya tetap).
 */

export const PRINT_CLASS = 'columns-print'

function container(plan: RegionPlan, startsPage: boolean): HTMLElement {
	const element = document.createElement('div')
	element.className = PRINT_CLASS
	element.style.columnCount = String(plan.count)
	element.style.columnGap = `${plan.gap}px`
	element.style.columnFill = plan.balance ? 'balance' : 'auto'
	if (startsPage) element.style.breakBefore = 'page'
	return element
}

function buildCopy(view: EditorView, plan: RegionPlan): void {
	const host = view.dom.querySelector(`[${REGION_SPACE_ATTRIBUTE}="${plan.pos}"]`)
	if (!(host instanceof HTMLElement)) return

	const parts: HTMLElement[] = []
	let current = container(plan, false)
	parts.push(current)
	let sectionClass: string | null = null
	for (const item of plan.items) {
		const node = view.state.doc.nodeAt(item.pos)
		const original = view.nodeDOM(item.pos)
		if (!node || !(original instanceof HTMLElement)) continue
		sectionClass ??= [...original.classList].find((name) => name.startsWith('document-section-')) ?? null
		/* Pemenggal halaman memulai wadah baru di halaman berikutnya - pemenggalan
		 * paksa di dalam wadah multi-kolom tidak dihormati semua peramban. */
		if (node.type.name === PAGE_BREAK_NODE) {
			current = container(plan, true)
			parts.push(current)
			continue
		}
		const copy = detachedCopy(original)
		for (const name of [...copy.classList])
			if (name.startsWith('document-section-')) copy.classList.remove(name)
		if (current.childElementCount === 0) copy.style.marginTop = '0'
		current.appendChild(copy)
	}

	/* Nama halaman cetak (`page: secN`) melekat ke blok di aliran akar; blok
	 * aslinya disembunyikan, jadi penjaga ruang yang membawanya. */
	if (sectionClass) {
		host.classList.add(sectionClass)
		host.dataset.printSection = sectionClass
	}
	/* Selama mencetak, salinan inilah naskahnya - jangan disembunyikan dari
	 * pohon aksesibilitas (PDF bertanda). */
	host.removeAttribute('aria-hidden')
	host.dataset.printCopy = 'true'
	host.append(...parts.filter((part) => part.childElementCount > 0))
}

function removeCopies(view: EditorView): void {
	for (const element of view.dom.querySelectorAll(`.${PRINT_CLASS}`)) element.remove()
	for (const host of view.dom.querySelectorAll<HTMLElement>('[data-print-copy]')) {
		if (host.dataset.printSection) host.classList.remove(host.dataset.printSection)
		delete host.dataset.printSection
		delete host.dataset.printCopy
		host.setAttribute('aria-hidden', 'true')
	}
}

/** Memasang pembuat salinan cetak; mengembalikan pelepasnya. */
export function attachColumnPrint(view: EditorView, plans: () => readonly RegionPlan[]): () => void {
	const before = () => {
		if (view.isDestroyed) return
		removeCopies(view)
		for (const plan of plans()) buildCopy(view, plan)
	}
	const after = () => {
		if (!view.isDestroyed) removeCopies(view)
	}
	window.addEventListener('beforeprint', before)
	window.addEventListener('afterprint', after)
	return () => {
		window.removeEventListener('beforeprint', before)
		window.removeEventListener('afterprint', after)
		if (!view.isDestroyed) removeCopies(view)
	}
}
