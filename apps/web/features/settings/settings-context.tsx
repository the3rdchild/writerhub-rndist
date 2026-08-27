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
	type PageSetup,
	type PageSizeId,
} from '@/features/editor/page-geometry'
import { usePersistentState } from '@/lib/use-persistent-state'

export const SETTINGS_STORAGE_KEY = 'writer-hub-settings'

export type Theme = 'dark' | 'light' | 'system'
export type FontSize = 'small' | 'medium' | 'large'
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
	zoom: number
	pageSize: PageSizeId
	pageOrientation: PageOrientation
	pageMargins: PageMargins
	focusMode: boolean
	showPageNumbers: boolean
	showRuler: boolean
	showDocumentTabs: boolean
	defaultPageSetup: PageSetup
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
	setPageMargins: (patch: Partial<PageMargins>) => void
	setDefaultPageSetup: (setup: PageSetup) => void
	updateProfile: (patch: Partial<UserProfile>) => void
	toggleFocusMode: () => void
	settingsOpen: boolean
	setSettingsOpen: (open: boolean) => void
	shortcutsOpen: boolean
	setShortcutsOpen: (open: boolean) => void
	exportOpen: boolean
	setExportOpen: (open: boolean) => void
	docxExportOpen: boolean
	setDocxExportOpen: (open: boolean) => void
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
					const next = { ...current, ...patch }
					return { ...next, pageMargins: clampMargins(next.pageMargins, next.pageSize, next.pageOrientation) }
				}),
			setPageMargins: (patch) =>
				setSettings((current) => ({
					...current,
					pageMargins: clampMargins(
						{ ...current.pageMargins, ...patch },
						current.pageSize,
						current.pageOrientation,
					),
				})),
			setDefaultPageSetup: (setup) => setSettings((current) => ({ ...current, defaultPageSetup: setup })),
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
