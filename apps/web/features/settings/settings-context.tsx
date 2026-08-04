'use client'

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import {
	clampMargins,
	DEFAULT_MARGINS,
	DEFAULT_PAGE_SIZE,
	type PageMargins,
	type PageSizeId,
} from '@/features/editor/page-geometry'
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
	/** Margin lembar, dalam piksel 96 dpi; diubah lewat penggaris. */
	pageMargins: PageMargins
	/** Sembunyikan menu & toolbar sampai kursor mendekat, untuk menulis tanpa gangguan. */
	focusMode: boolean
	/** Tampilkan nomor halaman di sudut lembar. */
	showPageNumbers: boolean
	/** Tampilkan penggaris di atas lembar. */
	showRuler: boolean
	/** Tampilkan sidebar tab dokumen & kerangka heading. */
	showDocumentTabs: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	theme: 'light',
	profile: { name: 'UserReguler', email: 'user@example.com', role: 'Premium' },
	editorFontSize: 'medium',
	autoSave: true,
	showWordCount: true,
	zoom: 1,
	pageSize: DEFAULT_PAGE_SIZE,
	pageMargins: DEFAULT_MARGINS,
	focusMode: false,
	showPageNumbers: true,
	showRuler: true,
	showDocumentTabs: true,
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
	/** Ubah sebagian margin; nilainya selalu dipangkas ke ukuran kertas aktif. */
	setPageMargins: (patch: Partial<PageMargins>) => void
	updateProfile: (patch: Partial<UserProfile>) => void
	toggleFocusMode: () => void
	settingsOpen: boolean
	setSettingsOpen: (open: boolean) => void
	/** Dialog daftar pintasan papan tik. */
	shortcutsOpen: boolean
	setShortcutsOpen: (open: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = usePersistentState<Settings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [shortcutsOpen, setShortcutsOpen] = useState(false)

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
			update: (patch) =>
				setSettings((current) => {
					// Margin diperiksa ulang setiap pengaturan berubah: berganti ukuran
					// kertas bisa membuat margin lama tidak menyisakan area teks lagi.
					const next = { ...current, ...patch }
					return { ...next, pageMargins: clampMargins(next.pageMargins, next.pageSize) }
				}),
			setPageMargins: (patch) =>
				setSettings((current) => ({
					...current,
					pageMargins: clampMargins({ ...current.pageMargins, ...patch }, current.pageSize),
				})),
			updateProfile: (patch) =>
				setSettings((current) => ({ ...current, profile: { ...current.profile, ...patch } })),
			toggleFocusMode: () => setSettings((current) => ({ ...current, focusMode: !current.focusMode })),
			settingsOpen,
			setSettingsOpen,
			shortcutsOpen,
			setShortcutsOpen,
		}),
		[settings, setSettings, settingsOpen, shortcutsOpen],
	)

	return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
	const context = useContext(SettingsContext)
	if (!context) throw new Error('useSettings harus dipakai di dalam <SettingsProvider>')
	return context
}
