'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * State yang dicerminkan ke localStorage.
 *
 * Nilai awal selalu `initialValue` supaya render server dan render klien
 * pertama identik; isi tersimpan baru dimuat setelah mount. `hydrated`
 * memberi tahu pemanggil kapan nilai sudah bisa dipercaya, sehingga UI bisa
 * menahan tampilan daftar kosong yang menipu.
 */
export function usePersistentState<T>(
	key: string,
	initialValue: T,
): [T, (update: T | ((current: T) => T)) => void, boolean] {
	const [value, setValue] = useState<T>(initialValue)
	const [hydrated, setHydrated] = useState(false)
	const keyRef = useRef(key)
	keyRef.current = key

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(key)
			if (raw !== null) setValue(JSON.parse(raw) as T)
		} catch {
			// storage tidak tersedia atau isinya rusak — pakai nilai awal
		}
		setHydrated(true)
	}, [key])

	const update = useCallback((next: T | ((current: T) => T)) => {
		setValue((current) => {
			const resolved = typeof next === 'function' ? (next as (c: T) => T)(current) : next
			try {
				window.localStorage.setItem(keyRef.current, JSON.stringify(resolved))
			} catch {
				// kuota penuh atau mode privat — state di memori tetap benar
			}
			return resolved
		})
	}, [])

	return [value, update, hydrated]
}
