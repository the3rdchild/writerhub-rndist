'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
	const initialRef = useRef(initialValue)
	initialRef.current = initialValue

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(key)
			if (raw !== null) setValue(withDefaults(JSON.parse(raw), initialRef.current))
		} catch {
		}
		setHydrated(true)
	}, [key])

	const update = useCallback((next: T | ((current: T) => T)) => {
		setValue((current) => {
			const resolved = typeof next === 'function' ? (next as (c: T) => T)(current) : next
			try {
				window.localStorage.setItem(keyRef.current, JSON.stringify(resolved))
			} catch {
			}
			return resolved
		})
	}, [])

	return [value, update, hydrated]
}
