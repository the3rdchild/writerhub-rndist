'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { FurnitureSlot } from './model'

/**
 * Mode sunting perabot halaman: satu slot pada satu lembar.
 *
 * Hidup sebagai context (bukan state kanvas) supaya dialog "Headers &
 * footers" bisa membuka mode sunting dari luar kanvas, dan kanvas tetap
 * satu-satunya yang merender editor kecilnya — dia yang punya lembar.
 */
export interface FurnitureEditTarget {
	slot: FurnitureSlot
	/** Lembar tempat editor ditempatkan; undefined = biarkan kanvas memilih. */
	sheetIndex?: number
}

interface FurnitureEditValue {
	edit: FurnitureEditTarget | null
	begin: (target: FurnitureEditTarget) => void
	end: () => void
}

const FurnitureEditContext = createContext<FurnitureEditValue | null>(null)

export function FurnitureEditProvider({ children }: { children: ReactNode }) {
	const [edit, setEdit] = useState<FurnitureEditTarget | null>(null)
	const begin = useCallback((target: FurnitureEditTarget) => setEdit(target), [])
	const end = useCallback(() => setEdit(null), [])
	const value = useMemo<FurnitureEditValue>(() => ({ edit, begin, end }), [edit, begin, end])
	return <FurnitureEditContext.Provider value={value}>{children}</FurnitureEditContext.Provider>
}

export function useFurnitureEdit(): FurnitureEditValue {
	const context = useContext(FurnitureEditContext)
	if (!context) throw new Error('useFurnitureEdit harus dipakai di dalam <FurnitureEditProvider>')
	return context
}
