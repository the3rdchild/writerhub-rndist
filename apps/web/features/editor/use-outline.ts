'use client'

import type { Node as PMNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

/**
 * Kerangka dokumen: daftar heading yang tampil bersarang di bawah tab aktif.
 *
 * Dibaca langsung dari dokumen ProseMirror, bukan disimpan terpisah, supaya
 * tidak pernah ada dua versi kebenaran saat pengguna mengetik. `pos` dipakai
 * untuk melompat — nilainya ikut berubah setiap dokumen berubah, jadi daftar
 * ini memang dihitung ulang pada tiap transaksi.
 */

export interface OutlineItem {
	pos: number
	level: number
	text: string
}

export interface Outline {
	items: OutlineItem[]
	/** Heading terdekat sebelum kursor; penanda "kamu sedang di sini". */
	activePos: number | null
}

const EMPTY: Outline = { items: [], activePos: null }

function readHeadings(doc: PMNode): OutlineItem[] {
	const items: OutlineItem[] = []

	doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			items.push({ pos, level: node.attrs.level ?? 1, text: node.textContent.trim() })
		}
		// Heading selalu blok tingkat atas pada skema ini, jadi tidak perlu turun
		// ke anak-anaknya — pemindaian ini berjalan pada tiap ketukan tombol.
		return false
	})

	return items
}

function activeHeading(items: readonly OutlineItem[], cursor: number): number | null {
	let active: number | null = null
	for (const item of items) {
		if (item.pos > cursor) break
		active = item.pos
	}
	return active
}

function sameOutline(a: Outline, b: Outline): boolean {
	return (
		a.activePos === b.activePos &&
		a.items.length === b.items.length &&
		a.items.every((item, index) => {
			const other = b.items[index]
			return item.pos === other.pos && item.level === other.level && item.text === other.text
		})
	)
}

export function useOutline(editor: Editor | null): Outline {
	const [outline, setOutline] = useState<Outline>(EMPTY)

	// Dokumen yang terakhir dipindai. Sebagian besar transaksi hanya memindahkan
	// kursor, dan untuk itu daftar heading yang sudah ada tetap sahih.
	const scannedDoc = useRef<PMNode | null>(null)
	const scannedItems = useRef<OutlineItem[]>([])

	useEffect(() => {
		if (!editor) {
			setOutline(EMPTY)
			return
		}

		const sync = () => {
			const { doc, selection } = editor.state

			if (scannedDoc.current !== doc) {
				scannedDoc.current = doc
				scannedItems.current = readHeadings(doc)
			}

			const next: Outline = {
				items: scannedItems.current,
				activePos: activeHeading(scannedItems.current, selection.from),
			}

			setOutline((current) => (sameOutline(current, next) ? current : next))
		}

		sync()
		editor.on('transaction', sync)
		return () => {
			editor.off('transaction', sync)
		}
	}, [editor])

	return outline
}

/** Gulirkan tampilan ke heading dan taruh kursor di sana. */
export function scrollToOutlineItem(editor: Editor, pos: number): void {
	editor.chain().focus().setTextSelection(pos + 1).run()

	const dom = editor.view.nodeDOM(pos)
	const element = dom instanceof HTMLElement ? dom : editor.view.domAtPos(pos + 1).node
	if (element instanceof HTMLElement) {
		element.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}
}
