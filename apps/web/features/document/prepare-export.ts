'use client'

import type { Editor } from '@tiptap/react'
import { refreshMermaidBlocks } from '@/components/editor/code-block-node-view'
import { refreshHtmlBlocks } from '@/components/editor/html-block-view'
import { refreshTocBlocks } from '@/components/editor/toc-block-view'

/**
 * Menyegarkan semua blok yang isinya **turunan** - daftar isi, potretan blok
 * HTML, diagram Mermaid - lalu menunggu yang asinkron selesai.
 *
 * Dulu hanya jalur DOCX yang memanggil dua di antaranya, sementara jalur cetak
 * memanggil `window.print()` langsung. Akibatnya PDF mencetak apa pun yang
 * kebetulan sudah ada di DOM: diagram yang belum sempat dirender keluar sebagai
 * kode mentah, dan blok HTML yang baru disunting keluar sebagai potretan lama.
 *
 * Ditaruh di satu tempat supaya jalur ekspor yang ditambahkan nanti tidak lagi
 * bisa lupa memanggil salah satunya.
 */
export async function prepareForExport(editor: Editor | null): Promise<void> {
	if (!editor) return
	const dom = editor.view.dom

	// Daftar isi serentak; dua sisanya asinkron dan harus ditunggu bersama.
	refreshTocBlocks(dom)
	await Promise.all([refreshHtmlBlocks(dom), refreshMermaidBlocks(dom)])
}
