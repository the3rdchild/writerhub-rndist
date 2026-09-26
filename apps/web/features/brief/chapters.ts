/**
 * Bab-bab naskah seperti yang dilihat brief: satu judul beserta semua isi di
 * bawahnya sampai judul berikutnya yang setingkat atau lebih tinggi.
 *
 * Dibaca dari JSON tab, bukan dari editor, karena bab sebuah skripsi bisa
 * tersebar di beberapa tab dan hanya satu yang sedang terbuka di editor.
 */

import type { JSONContent } from '@tiptap/core'
import { chapterKey, textFingerprint } from '@writer-hub/shared'

export interface HeadingSection {
	title: string
	level: number
	text: string
}

function textOf(node: JSONContent): string {
	if (node.type === 'text') return node.text ?? ''
	return (node.content ?? [])
		.map(textOf)
		.join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n')
}

/** Hanya judul di tingkat teratas: judul di dalam tabel atau kotak bukan awal bab. */
export function headingSections(json: JSONContent): HeadingSection[] {
	const blocks = json.content ?? []
	const heads: { at: number; level: number; title: string }[] = []
	blocks.forEach((block, at) => {
		if (block.type !== 'heading') return
		const title = textOf(block).replace(/\s+/g, ' ').trim()
		if (title) heads.push({ at, level: Number(block.attrs?.level ?? 1), title })
	})

	return heads.map((head, index) => {
		const next = heads.slice(index + 1).find((candidate) => candidate.level <= head.level)
		const body = blocks.slice(head.at + 1, next?.at ?? blocks.length)
		return { title: head.title, level: head.level, text: body.map(textOf).join('\n') }
	})
}

/**
 * Sidik jari isi tiap bab, menurut judulnya. Judul yang muncul dua kali di
 * naskah memakai kemunculan pertamanya - sama seperti pembaca yang mencari
 * "BAB II" lewat daftar isi.
 */
export function chapterFingerprints(tabs: readonly JSONContent[]): Map<string, string> {
	const prints = new Map<string, string>()
	for (const tab of tabs) {
		for (const section of headingSections(tab)) {
			const key = chapterKey(section.title)
			if (!prints.has(key)) prints.set(key, textFingerprint(section.text))
		}
	}
	return prints
}

/** Judul tingkat satu di naskah, urut - calon daftar bab bagi penulis yang belum mencatatnya. */
export function topLevelHeadings(tabs: readonly JSONContent[]): { title: string; empty: boolean }[] {
	const found: { title: string; empty: boolean }[] = []
	const seen = new Set<string>()
	for (const tab of tabs) {
		const sections = headingSections(tab)
		const top = Math.min(...sections.map((section) => section.level))
		for (const section of sections) {
			if (section.level !== top) continue
			const key = chapterKey(section.title)
			if (seen.has(key)) continue
			seen.add(key)
			found.push({ title: section.title, empty: section.text.trim() === '' })
		}
	}
	return found
}
