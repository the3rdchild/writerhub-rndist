'use client'

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
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
