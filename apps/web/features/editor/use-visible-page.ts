'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

function sheetsOf(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('.document-sheet'))
}

/**
 * Halaman yang sedang terlihat — lembar yang paling dekat ke pusat wadah
 * gulung — beserta lompatan instan ke lembar tertentu.
 *
 * Dipakai tampilan baca-saja (berbagi, riwayat versi) yang tidak punya kursor:
 * satu-satunya "posisi" yang berarti di sana adalah yang sedang dilihat.
 * Wadah gulungnya tidak seragam antar tampilan, tapi selalu leluhur terdekat
 * `.overflow-auto` dari lembar, jadi ia dicari per ukuran, bukan diteruskan
 * sebagai ref.
 *
 * `onUserScroll` dipanggil (ter-throttle rAF) tiap kali wadahnya bergulir —
 * pemanggil hybrid memakainya untuk mengalihkan sumber angka ke lembar
 * terlihat. Gulungan programatik pun memanggilnya; pemanggil yang peduli
 * cukup menegaskan kembali sumbernya setelah aksinya sendiri.
 */
export function useVisiblePage(onUserScroll?: () => void): {
	page: number
	scrollToPage: (page: number) => void
} {
	const [page, setPage] = useState(1)
	const notifyRef = useRef(onUserScroll)
	notifyRef.current = onUserScroll

	const measure = useCallback(() => {
		const list = sheetsOf()
		if (list.length < 2) return
		const scroller = list[0]?.closest('.overflow-auto')
		if (!scroller) return

		const rect = scroller.getBoundingClientRect()
		const center = rect.top + rect.height / 2
		let best = 0
		let bestDistance = Number.POSITIVE_INFINITY
		list.forEach((sheet, index) => {
			const box = sheet.getBoundingClientRect()
			const distance = Math.abs(box.top + box.height / 2 - center)
			if (distance < bestDistance) {
				bestDistance = distance
				best = index
			}
		})
		setPage((prev) => (best + 1 === prev ? prev : best + 1))
	}, [])

	useEffect(
		function trackVisibleSheet() {
			// Gulungan tidak menggelembung, tapi fase tangkap di window tetap
			// menerimanya dari wadah mana pun — tidak perlu mencari wadahnya
			// lebih dulu untuk sekadar mendengar.
			let frame = 0
			const onScroll = () => {
				if (frame) return
				frame = requestAnimationFrame(() => {
					frame = 0
					notifyRef.current?.()
					measure()
				})
			}
			window.addEventListener('scroll', onScroll, { capture: true, passive: true })
			return () => {
				window.removeEventListener('scroll', onScroll, true)
				if (frame) cancelAnimationFrame(frame)
			}
		},
		[measure],
	)

	const scrollToPage = useCallback((target: number) => {
		const sheet = sheetsOf()[target - 1]
		if (!sheet) return
		// Instan, bukan teranimasi: memindahkan lembar adalah navigasi, bukan
		// umpan balik gerak.
		sheet.scrollIntoView({ behavior: 'instant', block: 'start' })
		setPage((prev) => (target === prev ? prev : target))
	}, [])

	return { page, scrollToPage }
}
