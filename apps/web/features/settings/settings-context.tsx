'use client'

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import {
	clampMargins,
	DEFAULT_MARGINS,
	DEFAULT_PAGE_ORIENTATION,
	DEFAULT_PAGE_SETUP,
	DEFAULT_PAGE_SIZE,
	type PageMargins,
	type PageOrientation,
	type PageSizeId,
	type PageSetup,
} from '@/features/editor/page-geometry'
import { usePersistentState } from '@/lib/use-persistent-state'

export const SETTINGS_STORAGE_KEY = 'writer-hub-settings'

export type Theme = 'dark' | 'light' | 'system'
export type FontSize = 'small' | 'medium' | 'large'
/** Satuan ukur untuk dialog, penggaris, dan lekukan. Dipakai bersama A1/A3/A5. */
export type MeasurementUnit = 'cm' | 'in'

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
	/** Orientasi lembar: portrait (tegak) atau landscape (mendatar). */
	pageOrientation: PageOrientation
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
	/** Bawaan tata letak untuk dokumen BARU; dipakai oleh hook usePageSetup. */
	defaultPageSetup: PageSetup
	/** Satuan ukur (cm/inci) untuk dialog penyiapan, penggaris, lekukan. */
	measurementUnit: MeasurementUnit
}

export const DEFAULT_SETTINGS: Settings = {
	theme: 'light',
	profile: { name: 'UserReguler', email: 'user@example.com', role: 'Premium' },
	editorFontSize: 'medium',
	autoSave: true,
	showWordCount: true,
	zoom: 1,
	pageSize: DEFAULT_PAGE_SIZE,
	pageOrientation: DEFAULT_PAGE_ORIENTATION,
	pageMargins: DEFAULT_MARGINS,
	focusMode: false,
	showPageNumbers: true,
	showRuler: true,
	showDocumentTabs: true,
	defaultPageSetup: DEFAULT_PAGE_SETUP,
	measurementUnit: 'cm',
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
	/** Simpan tata letak saat ini sebagai bawaan dokumen baru. */
	setDefaultPageSetup: (setup: PageSetup) => void
	updateProfile: (patch: Partial<UserProfile>) => void
	toggleFocusMode: () => void
	settingsOpen: boolean
	setSettingsOpen: (open: boolean) => void
	/** Dialog daftar pintasan papan tik. */
	shortcutsOpen: boolean
	setShortcutsOpen: (open: boolean) => void
	/** Dialog panduan ekspor PDF. */
	exportOpen: boolean
	setExportOpen: (open: boolean) => void
	/** Dialog pilihan tab untuk ekspor DOCX. */
	docxExportOpen: boolean
	setDocxExportOpen: (open: boolean) => void
	/** Dialog penyiapan halaman (tata letak per dokumen/tab). */
	pageSetupOpen: boolean
	setPageSetupOpen: (open: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = usePersistentState<Settings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const [exportOpen, setExportOpen] = useState(false)
	const [docxExportOpen, setDocxExportOpen] = useState(false)
	const [pageSetupOpen, setPageSetupOpen] = useState(false)

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
					// kertas atau orientasi bisa membuat margin lama tidak menyisakan
					// area teks lagi.
					const next = { ...current, ...patch }
					return { ...next, pageMargins: clampMargins(next.pageMargins, next.pageSize, next.pageOrientation) }
				}),
			setPageMargins: (patch) =>
				setSettings((current) => ({
					...current,
					pageMargins: clampMargins({ ...current.pageMargins, ...patch }, current.pageSize, current.pageOrientation),
				})),
			setDefaultPageSetup: (setup) =>
				setSettings((current) => ({ ...current, defaultPageSetup: setup })),
			updateProfile: (patch) =>
				setSettings((current) => ({ ...current, profile: { ...current.profile, ...patch } })),
			toggleFocusMode: () => setSettings((current) => ({ ...current, focusMode: !current.focusMode })),
			settingsOpen,
			setSettingsOpen,
			shortcutsOpen,
			setShortcutsOpen,
			exportOpen,
			setExportOpen,
			docxExportOpen,
			setDocxExportOpen,
			pageSetupOpen,
			setPageSetupOpen,
		}),
		[settings, setSettings, settingsOpen, shortcutsOpen, exportOpen, docxExportOpen, pageSetupOpen],
	)

	return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
	const context = useContext(SettingsContext)
	if (!context) throw new Error('useSettings harus dipakai di dalam <SettingsProvider>')
	return context
}
