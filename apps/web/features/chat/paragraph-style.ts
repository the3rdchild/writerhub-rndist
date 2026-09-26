import type { NodeType, Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

/**
 * Mengubah gaya blok (paragraf ↔ heading) yang memuat sebuah rentang - untuk
 * `apply_paragraph_style`.
 *
 * Teks tempelan dari Word atau Google Docs sering memisahkan judul dan isinya
 * dengan pindah baris lunak (Shift+Enter), bukan paragraf baru: "1.1 Latar
 * Belakang⏎Struktur pasar merupakan..." adalah SATU blok. Mengubah gaya blok
 * itu utuh menjadikan seluruh paragraf isinya ikut menjadi heading. Karena
 * itu, saat jenis bloknya berubah, baris yang memuat rentang itu dipisahkan
 * dulu - pindah baris di tepinya menjadi batas paragraf - dan hanya baris itu
 * yang diubah.
 *
 * Kalau jenisnya tetap sama (heading yang hanya berganti level), blok dibiarkan
 * utuh: "BAB I⏎PENDAHULUAN" adalah satu judul dua baris yang disengaja.
 *
 * Mengembalikan jumlah blok yang diubah; nol berarti rentang itu tidak berada
 * di dalam blok teks mana pun.
 */
export function setBlockStyle(
	tr: Transaction,
	range: { from: number; to: number },
	type: NodeType,
	attrs: Record<string, unknown>,
): number {
	const blocks: { pos: number; node: PMNode }[] = []
	tr.doc.nodesBetween(range.from, range.to, (node, pos) => {
		if (!node.isTextblock) return true
		blocks.push({ pos, node })
		return false
	})

	// Dari belakang ke depan: memecah satu blok menggeser posisi sesudahnya,
	// tidak pernah yang sebelumnya.
	for (const { pos, node } of [...blocks].reverse()) {
		let target = pos

		if (node.type !== type) {
			const start = pos + 1
			const from = Math.max(range.from, start)
			const to = Math.min(range.to, pos + node.nodeSize - 1)
			const breaks: number[] = []
			node.forEach((child, offset) => {
				if (child.type.name === 'hardBreak') breaks.push(start + offset)
			})

			const before = breaks.filter((at) => at < from).at(-1)
			const after = breaks.find((at) => at >= to)
			// Belakang dulu, supaya posisi pindah baris di depannya tetap sah.
			if (after !== undefined) {
				tr.delete(after, after + 1)
				tr.split(after)
			}
			if (before !== undefined) {
				tr.delete(before, before + 1)
				tr.split(before)
				target = before + 1
			}
		}

		const current = tr.doc.nodeAt(target)
		if (!current) continue
		tr.setNodeMarkup(target, type, { ...current.attrs, ...attrs })
	}

	return blocks.length
}
