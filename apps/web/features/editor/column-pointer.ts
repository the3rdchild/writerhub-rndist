import { type EditorState, Plugin, Selection, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { positionAtOffset } from './column-measure'
import { CLONE_CLASS, type PlannedFragment, type PlannedItem, type RegionPlan } from './column-render'

/*
 * Tetikus di wilayah berkolom.
 *
 * Dua hal yang tidak bisa ditangani ProseMirror sendiri:
 *
 * - Salinan potongan (column-render.ts) bukan bagian naskah. Klik dan seret di
 *   atasnya dipetakan ke blok aslinya: jalur simpul di salinan diikuti di blok
 *   asli, lalu `posAtDOM`.
 * - Celah antarkolom dan ruang kosong di bawah kolom tidak memuat teks.
 *   `posAtCoords` di sana jatuh ke blok mana saja yang kebetulan sebaris di
 *   DOM - kursor sempat melompat ke awal naskah (KOL-15). Klik di sana kini
 *   menaruh kursor di baris terdekat pada kolom terdekat, seperti Word/Docs.
 *
 * Klik di teks blok asli tetap milik ProseMirror sepenuhnya, termasuk klik
 * ganda/tiga kali dan seret yang dimulai di sana.
 */

interface Hit {
	pos: number
}

function bodyScale(view: EditorView): { rect: DOMRect; scale: number } {
	const rect = view.dom.getBoundingClientRect()
	const scale = view.dom.offsetWidth > 0 ? rect.width / view.dom.offsetWidth || 1 : 1
	return { rect, scale }
}

function itemOfKey(plans: readonly RegionPlan[], key: number): PlannedItem | null {
	for (const plan of plans) for (const item of plan.items) if (item.key === key) return item
	return null
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
	const doc = document as Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
		caretRangeFromPoint?: (x: number, y: number) => Range | null
	}
	if (doc.caretPositionFromPoint) {
		const position = doc.caretPositionFromPoint(x, y)
		if (position) return { node: position.offsetNode, offset: position.offset }
	}
	if (doc.caretRangeFromPoint) {
		const range = doc.caretRangeFromPoint(x, y)
		if (range) return { node: range.startContainer, offset: range.startOffset }
	}
	return null
}

/** Jalur indeks anak dari `root` ke `node`, atau null bila `node` di luar `root`. */
function pathFrom(root: Node, node: Node): number[] | null {
	const path: number[] = []
	let current: Node | null = node
	while (current && current !== root) {
		const parent: Node | null = current.parentNode
		if (!parent) return null
		path.unshift(Array.prototype.indexOf.call(parent.childNodes, current))
		current = parent
	}
	return current === root ? path : null
}

function follow(root: Node, path: readonly number[]): Node | null {
	let current: Node | null = root
	for (const index of path) {
		current = current?.childNodes[index] ?? null
		if (!current) return null
	}
	return current
}

/** Posisi naskah di bawah titik (x, y) yang jatuh di salinan potongan. */
function cloneHit(
	view: EditorView,
	plans: readonly RegionPlan[],
	clone: HTMLElement,
	x: number,
	y: number,
): Hit | null {
	const item = itemOfKey(plans, Number(clone.dataset.cloneOf))
	if (!item) return null
	const original = view.nodeDOM(item.pos)
	const copy = clone.firstElementChild
	if (!(original instanceof HTMLElement) || !copy) return null

	const caret = caretAt(x, y)
	if (caret && copy.contains(caret.node)) {
		const path = pathFrom(copy, caret.node)
		const twin = path ? follow(original, path) : null
		if (twin) {
			try {
				return { pos: view.posAtDOM(twin, caret.offset) }
			} catch {
				// jatuh ke pencarian baris di bawah
			}
		}
	}

	/* Cadangan: baris blok asli pada ketinggian yang sama. */
	const { scale } = bodyScale(view)
	const local = (y - clone.getBoundingClientRect().top) / scale + (Number(clone.dataset.offset) || 0)
	return { pos: positionAtOffset(view, original, item.pos, item.pos + item.nodeSize, local) }
}

/** Petak terdekat dari titik badan naskah (bx, by) di wilayah yang memuatnya. */
function nearestFragment(
	plans: readonly RegionPlan[],
	bx: number,
	by: number,
): { item: PlannedItem; fragment: PlannedFragment } | null {
	let best: { item: PlannedItem; fragment: PlannedFragment; score: number } | null = null
	for (const plan of plans) {
		if (by < plan.top - 4 || by > plan.top + plan.height + 4) continue
		for (const item of plan.items) {
			for (const fragment of item.fragments) {
				if (fragment.height <= 0) continue
				const top = fragment.top + fragment.header
				const bottom = top + fragment.height
				const dx = Math.max(0, fragment.left - bx, bx - (fragment.left + fragment.width))
				const dy = Math.max(0, top - by, by - bottom)
				/* Kolom yang sama lebih diutamakan daripada baris yang sejajar di kolom sebelah. */
				const score = dx * 3 + dy
				if (!best || score < best.score) best = { item, fragment, score }
			}
		}
	}
	return best
}

/**
 * Posisi naskah untuk titik layar (x, y) di wilayah berkolom, atau null bila
 * titiknya bukan urusan kolom (biarkan ProseMirror).
 */
export function columnPositionAt(
	view: EditorView,
	plans: readonly RegionPlan[],
	x: number,
	y: number,
	clampOnly = false,
): number | null {
	const target = document.elementFromPoint(x, y)
	const clone = target?.closest(`.${CLONE_CLASS}:not(.columns-clone-header)`)
	if (clone instanceof HTMLElement && view.dom.contains(clone))
		return cloneHit(view, plans, clone, x, y)?.pos ?? null
	if (!clampOnly && target && view.dom.contains(target) && target.closest('.columns-item')) {
		return view.posAtCoords({ left: x, top: y })?.pos ?? null
	}

	const { rect, scale } = bodyScale(view)
	const bx = (x - rect.left) / scale
	const by = (y - rect.top) / scale
	const nearest = nearestFragment(plans, bx, by)
	if (!nearest || clampOnly) return null
	const { fragment } = nearest
	const top = fragment.top + fragment.header
	const cx = Math.min(Math.max(bx, fragment.left + 1), fragment.left + fragment.width - 1)
	const cy = Math.min(Math.max(by, top + 2), top + fragment.height - 2)
	const clientX = rect.left + cx * scale
	const clientY = rect.top + cy * scale
	const inner = document.elementFromPoint(clientX, clientY)
	const innerClone = inner?.closest(`.${CLONE_CLASS}:not(.columns-clone-header)`)
	if (innerClone instanceof HTMLElement && view.dom.contains(innerClone)) {
		return cloneHit(view, plans, innerClone, clientX, clientY)?.pos ?? null
	}
	return view.posAtCoords({ left: clientX, top: clientY })?.pos ?? null
}

/** Titik di wilayah berkolom yang tidak menunjuk teks: celah antarkolom, ruang kosong di bawah kolom. */
function isEmptyRegionPoint(
	view: EditorView,
	plans: readonly RegionPlan[],
	target: Element,
	y: number,
): boolean {
	if (target !== view.dom && !target.classList.contains('columns-region-space')) return false
	const { rect, scale } = bodyScale(view)
	const by = (y - rect.top) / scale
	return plans.some((plan) => by >= plan.top - 4 && by <= plan.top + plan.height + 4)
}

function selectionFor(view: EditorView, anchor: number, head: number): Selection {
	const { doc } = view.state
	const clamp = (pos: number) => Math.max(0, Math.min(pos, doc.content.size))
	const $head = doc.resolve(clamp(head))
	if (anchor === head) return Selection.near($head)
	const $anchor = doc.resolve(clamp(anchor))
	return $anchor.parent.inlineContent && $head.parent.inlineContent
		? TextSelection.between($anchor, $head)
		: Selection.near($head)
}

/** Kata di sekitar `pos` (klik ganda di salinan). */
function wordAround(view: EditorView, pos: number): { from: number; to: number } | null {
	const $pos = view.state.doc.resolve(pos)
	if (!$pos.parent.inlineContent) return null
	const text = $pos.parent.textBetween(0, $pos.parent.content.size, '￼', '￼')
	const at = $pos.parentOffset
	const word = /[\p{L}\p{N}_'-]/u
	let start = at
	let end = at
	while (start > 0 && word.test(text[start - 1])) start -= 1
	while (end < text.length && word.test(text[end])) end += 1
	if (start === end) return null
	const base = $pos.start()
	return { from: base + start, to: base + end }
}

export function columnPointerPlugin(plansOf: (state: EditorState) => readonly RegionPlan[]): Plugin {
	return new Plugin({
		props: {
			handleDOMEvents: {
				/* Salinan tidak bisa disunting, jadi tautan dan kotak centang di
				 * dalamnya akan bertindak sendiri (membuka tautan, mencentang) -
				 * padahal di naskah aslinya keduanya diam. */
				click(_view, event) {
					const target = event.target instanceof Element ? event.target : null
					if (!target?.closest(`.${CLONE_CLASS}`)) return false
					event.preventDefault()
					return true
				},
				mousedown(view, event) {
					if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return false
					const plans = plansOf(view.state)
					if (plans.length === 0) return false
					const target = event.target instanceof Element ? event.target : null
					if (!target) return false
					const clone = target.closest(`.${CLONE_CLASS}`)
					if (!clone && !isEmptyRegionPoint(view, plans, target, event.clientY)) return false

					const pos = columnPositionAt(view, plans, event.clientX, event.clientY)
					if (pos === null) return false
					event.preventDefault()
					view.focus()

					const anchor = event.shiftKey ? view.state.selection.anchor : pos
					if (!event.shiftKey && event.detail === 2) {
						const word = wordAround(view, pos)
						if (word) {
							view.dispatch(
								view.state.tr.setSelection(TextSelection.create(view.state.doc, word.from, word.to)),
							)
							return true
						}
					}
					if (!event.shiftKey && event.detail >= 3) {
						const $pos = view.state.doc.resolve(pos)
						if ($pos.parent.inlineContent) {
							view.dispatch(
								view.state.tr.setSelection(TextSelection.create(view.state.doc, $pos.start(), $pos.end())),
							)
							return true
						}
					}
					view.dispatch(view.state.tr.setSelection(selectionFor(view, anchor, pos)))

					/* Seret: kepala seleksi mengikuti tetikus, di salinan maupun blok asli. */
					const move = (next: MouseEvent) => {
						if (view.isDestroyed) return
						const currentPlans = plansOf(view.state)
						const head =
							columnPositionAt(view, currentPlans, next.clientX, next.clientY) ??
							view.posAtCoords({ left: next.clientX, top: next.clientY })?.pos
						if (head === undefined || head === null) return
						const selection = selectionFor(view, anchor, head)
						if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection))
					}
					const up = () => {
						window.removeEventListener('mousemove', move)
						window.removeEventListener('mouseup', up)
					}
					window.addEventListener('mousemove', move)
					window.addEventListener('mouseup', up)
					return true
				},
			},
		},
	})
}
