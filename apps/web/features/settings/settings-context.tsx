'use client'

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_PAGE_SIZE, type PageSizeId } from '@/features/editor/page-geometry'
import { usePersistentState } from '@/lib/use-persistent-state'

export const SETTINGS_STORAGE_KEY = 'writer-hub-settings'

export type Theme = 'dark' | 'light' | 'system'
export type FontSize = 'small' | 'medium' | 'large'

export interface UserProfile {
	name: string
	email: string
	role: string
}

export interface Settings {
	theme: Theme
	profile: UserProfile
	editorFontSize: FontSize
	autoSave: boolean
	showWordCount: boolean
	/** Perbesaran lembar dokumen; 1 = 100%. */
	zoom: number
	pageSize: PageSizeId
	/** Sembunyikan menu & toolbar sampai kursor mendekat, untuk menulis tanpa gangguan. */
	focusMode: boolean
	/** Tampilkan penggaris halaman & nomor halaman. */
	showPageNumbers: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	theme: 'light',
	profile: { name: 'UserReguler', email: 'user@example.com', role: 'Premium' },
	editorFontSize: 'medium',
	autoSave: true,
	showWordCount: true,
	zoom: 1,
	pageSize: DEFAULT_PAGE_SIZE,
	focusMode: false,
	showPageNumbers: true,
}

function resolveTheme(theme: Theme): 'dark' | 'light' {
	if (theme !== 'system') return theme
	if (typeof window === 'undefined') return 'light'
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Terapkan tema ke elemen <html>; token CSS di globals.css yang mengerjakan sisanya. */
export function applyTheme(theme: Theme): void {
	const resolved = resolveTheme(theme)
	const root = document.documentElement
	root.classList.toggle('dark', resolved === 'dark')
	root.classList.toggle('light', resolved === 'light')
	root.style.colorScheme = resolved
}

interface SettingsContextValue {
	settings: Settings
	update: (patch: Partial<Settings>) => void
	updateProfile: (patch: Partial<UserProfile>) => void
	toggleFocusMode: () => void
	settingsOpen: boolean
	setSettingsOpen: (open: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = usePersistentState<Settings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
	const [settingsOpen, setSettingsOpen] = useState(false)

	// Terapkan lagi setelah hidrasi: theme-script hanya tahu nilai tersimpan,
	// sedangkan preferensi "system" bisa berubah selama sesi berjalan.
	useEffect(() => {
		applyTheme(settings.theme)
	}, [settings.theme])

	useEffect(() => {
		if (settings.theme !== 'system') return
		const media = window.matchMedia('(prefers-color-scheme: dark)')
		const onChange = () => applyTheme('system')
		media.addEventListener('change', onChange)
		return () => media.removeEventListener('change', onChange)
	}, [settings.theme])

	const value = useMemo<SettingsContextValue>(
		() => ({
			settings,
			update: (patch) => setSettings((current) => ({ ...current, ...patch })),
			updateProfile: (patch) =>
				setSettings((current) => ({ ...current, profile: { ...current.profile, ...patch } })),
			toggleFocusMode: () => setSettings((current) => ({ ...current, focusMode: !current.focusMode })),
			settingsOpen,
			setSettingsOpen,
		}),
		[settings, setSettings, settingsOpen],
	)

	return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
	const context = useContext(SettingsContext)
	if (!context) throw new Error('useSettings harus dipakai di dalam <SettingsProvider>')
	return context
}
