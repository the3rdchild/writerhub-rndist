'use client'

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

/**
 * State dialog bagikan. Versi ini hanya mengelola buka/tutup dialog;
 * pembuatan link sendiri dikerjakan di dalam komponen dialog karena ia
 * membutuhkan akses ke instance editor dan judul dokumen.
 */
interface ShareContextValue {
	shareOpen: boolean
	setShareOpen: (open: boolean) => void
}

const ShareContext = createContext<ShareContextValue | null>(null)

export function ShareProvider({ children }: { children: ReactNode }) {
	const [shareOpen, setShareOpen] = useState(false)

	const value = useMemo<ShareContextValue>(() => ({ shareOpen, setShareOpen }), [shareOpen])

	return <ShareContext.Provider value={value}>{children}</ShareContext.Provider>
}

export function useShare(): ShareContextValue {
	const context = useContext(ShareContext)
	if (!context) throw new Error('useShare harus dipakai di dalam <ShareProvider>')
	return context
}
