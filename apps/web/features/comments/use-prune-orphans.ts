'use client'

import { useEffect } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSessions } from '@/features/sessions/session-context'
import { commentRanges } from './anchors'

/**
 * Buang utas yang kalimatnya sudah tidak ada.
 *
 * Komentar hidup dari jangkarnya. Begitu teks yang ditandainya dihapus, utas itu
 * tidak menunjuk apa pun: ia tidak bisa dibuka, tidak bisa dijawab di tempatnya,
 * dan di gutter ia tidak punya ketinggian yang sah. Membiarkannya berarti panel
 * pelan-pelan terisi utas yang tidak bisa diapa-apakan.
 *
 * Yang dibiarkan tinggal adalah utas yang sudah selesai: sorotannya memang
 * dilepas saat ditutup - termasuk saat usulannya diterapkan - jadi "mark-nya
 * tidak ada" pada utas selesai bukan tanda hilang, melainkan tanda beres.
 */

/** Jeda sebelum memutuskan; naskah harus diam dulu. */
const SETTLE_MS = 1500

/**
 * Utas semuda ini dilewati.
 *
 * Utas lahir bersamaan dengan mark-nya, dan keduanya masuk lewat dua transaksi
 * yang berbeda. Jarak antara keduanya sangat pendek, tapi bukan nol - dan yang
 * dipertaruhkan kalau salah adalah komentar yang baru saja diketik seseorang.
 */
const GRACE_MS = 4000

export function usePruneOrphanComments(onPruned?: (id: string) => void): void {
	const { activeId, comments, removeComment } = useSessions()
	const { editor } = useEditorInstance()

	useEffect(() => {
		if (!editor || editor.isDestroyed || !activeId) return

		const prune = () => {
			if (editor.isDestroyed) return

			/*
			 * Dokumen kosong tidak pernah jadi alasan menghapus.
			 *
			 * Itu bentuk yang sama persis dengan editor yang naskahnya belum selesai
			 * dimuat dari Y.Doc - dan pada saat itu SEMUA mark memang belum ada.
			 * Menghapus atas dasar itu berarti satu tab yang lambat memuat kehilangan
			 * seluruh komentarnya sekaligus.
			 */
			if (editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ').trim() === '') {
				return
			}

			const ranges = commentRanges(editor)
			const now = Date.now()

			for (const thread of comments) {
				if (thread.resolved) continue
				if (ranges.has(thread.id)) continue
				if (now - thread.createdAt < GRACE_MS) continue

				removeComment(thread.id)
				onPruned?.(thread.id)
			}
		}

		/*
		 * Penghitung waktunya diulang dari nol tiap kali ada yang berubah - termasuk
		 * saat editor atau tab aktifnya berganti, karena keduanya ada di daftar
		 * dependensi efek ini.
		 *
		 * Itu bukan sekadar penghematan. Berpindah tab menyisakan satu commit di
		 * mana daftar komentar sudah milik tab baru sementara instance editornya
		 * masih memegang naskah tab lama; membandingkan keduanya pada saat itu
		 * berarti menghapus seluruh komentar tab yang baru dibuka. Jeda ini membuat
		 * saat itu tidak pernah sempat jadi keputusan.
		 */
		let timer = setTimeout(prune, SETTLE_MS)
		const restart = () => {
			clearTimeout(timer)
			timer = setTimeout(prune, SETTLE_MS)
		}

		editor.on('update', restart)
		return () => {
			clearTimeout(timer)
			editor.off('update', restart)
		}
	}, [activeId, comments, editor, onPruned, removeComment])
}
