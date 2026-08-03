'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * State yang dicerminkan ke localStorage.
 *
 * Nilai awal selalu `initialValue` supaya render server dan render klien
 * pertama identik; isi tersimpan baru dimuat setelah mount. `hydrated`
 * memberi tahu pemanggil kapan nilai sudah bisa dipercaya, sehingga UI bisa
 * menahan tampilan daftar kosong yang menipu.
 *
 * Isi tersimpan digabung di atas `initialValue`: data dari versi aplikasi
 * sebelumnya tidak punya field yang baru ditambahkan, dan tanpa penggabungan
 * ini pengguna lama akan menerima `undefined` di tempat nilai bawaan.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withDefaults<T>(stored: unknown, initialValue: T): T {
	if (!isPlainObject(stored) || !isPlainObject(initialValue)) return stored as T
	return { ...initialValue, ...stored } as T
}

export function usePersistentState<T>(
	key: string,
	initialValue: T,
): [T, (update: T | ((current: T) => T)) => void, boolean] {
	const [value, setValue] = useState<T>(initialValue)
	const [hydrated, setHydrated] = useState(false)
	const keyRef = useRef(key)
	keyRef.current = key

	// Nilai bawaan dibaca lewat ref supaya pemanggil boleh menuliskannya inline
	// tanpa memicu pemuatan ulang tiap render.
	const initialRef = useRef(initialValue)
	initialRef.current = initialValue

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(key)
			if (raw !== null) setValue(withDefaults(JSON.parse(raw), initialRef.current))
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
