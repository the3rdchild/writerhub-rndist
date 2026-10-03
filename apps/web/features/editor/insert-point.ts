'use client'

import { NodeSelection, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'

/**
 * Memindahkan kursor keluar dari blok atom yang sedang terpilih, ke posisi teks
 * sesudahnya.
 *
 * Ia dipanggil tepat sebelum alat AI menyisipkan sesuatu di kursor, dan ada
 * karena penyisipan blok atom - blok rancangan HTML, daftar isi, gambar, rumus
 * blok - meninggalkan kursor sebagai `NodeSelection` **di atas blok yang baru
 * saja disisipkan**. TipTap menutup `insertContentAt` dengan
 * `Selection.near(pos, -1)`, dan pada saat itu blok atom tadi masih anak
 * terakhir dokumen: tidak ada posisi teks di depannya yang bisa dipilih, jadi
 * yang terpilih blok itu sendiri. Paragraf penutup dari `TrailingParagraph`
 * baru lahir satu transaksi kemudian - terlambat untuk dipilih, dan pemetaan
 * posisi dengan setia mempertahankan pilihan simpul itu.
 *
 * Akibatnya baru terasa pada panggilan alat berikutnya: `insertContent`
 * menyisipkan ke **rentang** pilihan, dan rentang sebuah `NodeSelection` adalah
 * blok itu sendiri - jadi sisipan berikutnya menimpa blok sebelumnya. Itulah
 * sebabnya sampul buku lenyap padahal langkahnya dilaporkan "Applied":
 * pamflet yang berdiri sendiri selamat hanya karena tidak ada alat yang
 * menyusul di belakangnya.
 *
 * Arah pencariannya ke depan (`bias` 1) supaya ia mendarat di paragraf penutup,
 * bukan kembali ke naskah sebelum blok itu.
 */
export function escapeNodeSelection(tr: Transaction): Transaction {
	if (tr.selection instanceof NodeSelection) {
		tr.setSelection(Selection.near(tr.doc.resolve(tr.selection.to), 1))
	}
	return tr
}

/**
 * Taruh kursor teks di sisi sebuah blok atom (gambar, daftar isi) - di awal
 * paragraf sesudahnya atau di akhir paragraf sebelumnya, dan buat paragraf
 * kosong bila sisi itu bukan teks. Dipakai sesudah menyisip dari UI, supaya
 * ketikan atau sisipan berikutnya tidak menimpa blok yang baru disisipkan
 * (uji editor 2 Okt, OBJ-5), dan saat mengklik ruang kosong di samping gambar
 * (OBJ-6). Garis horizontal bawaan Tiptap sudah berperilaku begini.
 */
export function placeCursorBeside(tr: Transaction, nodePos: number, side: 'before' | 'after'): Transaction {
	const node = tr.doc.nodeAt(nodePos)
	if (!node) return tr
	const paragraph = tr.doc.type.schema.nodes.paragraph
	try {
		if (side === 'after') {
			const after = nodePos + node.nodeSize
			const next = tr.doc.resolve(after).nodeAfter
			if (next?.isTextblock) return tr.setSelection(TextSelection.create(tr.doc, after + 1))
			tr.insert(after, paragraph.create())
			return tr.setSelection(TextSelection.create(tr.doc, after + 1))
		}
		const previous = tr.doc.resolve(nodePos).nodeBefore
		if (previous?.isTextblock) return tr.setSelection(TextSelection.create(tr.doc, nodePos - 1))
		tr.insert(nodePos, paragraph.create())
		return tr.setSelection(TextSelection.create(tr.doc, nodePos + 1))
	} catch {
		return tr.setSelection(
			Selection.near(
				tr.doc.resolve(side === 'after' ? nodePos + node.nodeSize : nodePos),
				side === 'after' ? 1 : -1,
			),
		)
	}
}

/** Bila yang terpilih blok atom yang baru disisipkan, pindahkan kursor ke sesudahnya. */
export function continueAfterSelectedBlock(tr: Transaction): Transaction {
	const { selection } = tr
	if (!(selection instanceof NodeSelection) || !selection.node.isBlock) return tr
	return placeCursorBeside(tr, selection.from, 'after')
}

/**
 * Posisi tepat sesudah tabel terluar yang memuat kursor, atau `null` bila
 * kursor tidak berada di dalam tabel.
 *
 * Untuk blok yang tidak dimaksudkan masuk ke sel, yaitu diagram. TipTap menutup
 * `insertContent` dengan kursor di akhir isi yang baru disisipkan, jadi naskah
 * yang berakhir dengan tabel meninggalkan kursor di sel terakhirnya. Diagram
 * yang menyusul lewat kursor lalu mendarat di dalam sel itu: di uji UC9, grafik
 * batang untuk "di bawah Tabel 1.1" masuk ke sel terakhir tabelnya. Model tidak
 * punya cara menunjuk sel, jadi kursor di dalam tabel pada saat itu hampir
 * selalu sisa sisipan sebelumnya.
 *
 * Tabel terluar, bukan yang terdalam: keluar dari tabel bersarang saja masih
 * menyisakan diagramnya di sel tabel luar.
 */
export function positionAfterTable(selection: Selection): number | null {
	const { $from } = selection
	for (let depth = 1; depth <= $from.depth; depth += 1) {
		if ($from.node(depth).type.spec.tableRole === 'table') return $from.after(depth)
	}
	return null
}
