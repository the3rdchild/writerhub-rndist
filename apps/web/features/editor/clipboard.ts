'use client'

import type { Editor } from '@tiptap/react'
import { textToParagraphs } from './text-content'

/*
 * Operasi papan klip untuk menu konteks & pintasan editor.
 *
 * Peramban tidak mengizinkan `execCommand('paste')`, jadi menempel lewat menu
 * harus membaca papan klip secara eksplisit - HTML bila ada agar formatnya
 * ikut, teks polos sebagai jalan paling akhir.
 */

async function readTextSafe(): Promise<string> {
	try {
		return await navigator.clipboard.readText()
	} catch {
		return ''
	}
}

/**
 * Salin seleksi ke papan klip; mengembalikan false bila peramban menolak
 * (mis. izin papan klip ditolak) supaya pemanggil bisa membatalkan aksi
 * lanjutan seperti memotong.
 */
export async function copySelection(editor: Editor): Promise<boolean> {
	editor.commands.focus()
	/*
	 * execCommand sudah usang tetapi tetap satu-satunya cara singkron untuk
	 * menyalin **kaya** (HTML + teks) dari seleksi contenteditable tanpa
	 * peramban meminta izin; teks polos menjadi cadangannya.
	 */
	try {
		if (document.execCommand('copy')) return true
	} catch {
		/* jatuh ke bawah */
	}
	const { from, to } = editor.state.selection
	try {
		await navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, '\n'))
		return true
	} catch {
		return false
	}
}

/**
 * Potong seleksi: salin dulu, hapus hanya bila penyalinan berhasil agar isi
 * tidak lenyap tanpa pernah sampai ke papan klip.
 */
export async function cutSelection(editor: Editor): Promise<void> {
	if (!(await copySelection(editor))) return
	editor.chain().focus().deleteSelection().run()
}

/** Tempel isi papan klip di kursor; HTML dipertahankan bila tersedia. */
export async function pasteFromClipboard(editor: Editor): Promise<void> {
	let html: string | null = null
	try {
		for (const item of await navigator.clipboard.read()) {
			if (item.types.includes('text/html')) {
				html = await (await item.getType('text/html')).text()
				break
			}
		}
	} catch {
		/* izin ditolak / peramban tanpa clipboard.read - pakai teks polos */
	}

	if (html) {
		editor.chain().focus().insertContent(html).run()
		return
	}
	const text = await readTextSafe()
	pastePlainText(editor, text)
}

/** Baca papan klip lalu tempel sebagai teks polos. */
export async function pastePlainTextFromClipboard(editor: Editor): Promise<void> {
	pastePlainText(editor, await readTextSafe())
}

/** Teks polos: satu baris tetap menyatu di kursor, banyak baris jadi paragraf. */
export function pastePlainText(editor: Editor, text: string): void {
	if (!text) return
	const inline = !text.includes('\n')
	editor
		.chain()
		.focus()
		.insertContent(inline ? text : textToParagraphs(text))
		.run()
}

/** Bersihkan gaya seleksi - sama dengan tombol "Clear formatting" di toolbar. */
export function clearFormatting(editor: Editor): boolean {
	return editor.chain().focus().unsetAllMarks().clearNodes().run()
}
