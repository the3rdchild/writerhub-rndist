import type { NodeType, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { canSplit } from '@tiptap/pm/transform'

/*
 * Menyisipkan pemenggal (halaman baru, kolom baru, pembatas section) - node
 * atom bertinggi nol yang hanya berarti di tingkat atas naskah - lalu menaruh
 * kursor di halaman/kolom barunya.
 *
 * `insertContent` bawaan memilih node atom yang baru disisipkan bila ia
 * mendarat di ujung blok teks (`selectionToInsertionEnd`), sehingga ketikan
 * berikutnya menggantikan pemenggalnya dan halaman/kolom barunya hilang
 * (KOL-5). Word dan Docs selalu menaruh kursor di halaman/kolom baru: di
 * awal paruh kedua bila paragrafnya dipecah, atau di baris kosong baru bila
 * pemenggal disisipkan di ujung paragraf.
 */

/** Kursor di awal blok tingkat atas (tidak ada isi sebelumnya di blok itu)? */
function atTopStart($pos: ResolvedPos): boolean {
	if ($pos.parentOffset !== 0) return false
	for (let depth = 1; depth < $pos.depth; depth += 1) if ($pos.index(depth) !== 0) return false
	return true
}

/** Kursor di ujung blok tingkat atas? */
function atTopEnd($pos: ResolvedPos): boolean {
	if ($pos.parentOffset !== $pos.parent.content.size) return false
	for (let depth = 1; depth < $pos.depth; depth += 1) {
		if ($pos.index(depth) !== $pos.node(depth).childCount - 1) return false
	}
	return true
}

export function insertBreak(
	state: EditorState,
	tr: Transaction,
	dispatch: ((tr: Transaction) => void) | undefined,
	type: NodeType | undefined,
	attrs: Record<string, unknown> | null = null,
): boolean {
	const paragraph = state.schema.nodes.paragraph
	if (!type || !paragraph) return false
	if (!dispatch) return true

	if (!tr.selection.empty) tr.deleteSelection()
	const $pos = tr.selection.$from

	/* Batas antara dua blok tingkat atas tempat pemenggal disisipkan, dan
	 * apakah sesudahnya perlu paragraf kosong untuk kursor. */
	let at: number
	let freshLine = false
	if ($pos.depth === 0) {
		at = $pos.pos
	} else if (atTopStart($pos) && ($pos.parent.content.size > 0 || $pos.depth === 1)) {
		/* Di awal blok - atau di paragraf kosong: blok itu sendiri yang pindah
		 * ke halaman/kolom baru, kursor ikut bersamanya. */
		at = $pos.before(1)
	} else if (atTopEnd($pos)) {
		at = $pos.after(1)
		freshLine = true
	} else if (canSplit(tr.doc, $pos.pos, $pos.depth)) {
		/* Di tengah paragraf (juga di dalam daftar/kutipan): pecah sampai ke
		 * tingkat atas, pemenggal di antara kedua paruhnya. */
		tr.split($pos.pos, $pos.depth)
		at = $pos.pos + $pos.depth
	} else {
		/* Tidak bisa dipecah (sel tabel): pemenggal sesudah blok terluarnya. */
		at = $pos.after(1)
		freshLine = true
	}

	const node = type.create(attrs)
	tr.insert(at, node)
	const after = at + node.nodeSize
	if (freshLine || !tr.doc.resolve(after).nodeAfter) tr.insert(after, paragraph.create())
	tr.setSelection(
		Selection.findFrom(tr.doc.resolve(after), 1, true) ?? TextSelection.near(tr.doc.resolve(after)),
	)
	tr.scrollIntoView()
	dispatch(tr)
	return true
}
