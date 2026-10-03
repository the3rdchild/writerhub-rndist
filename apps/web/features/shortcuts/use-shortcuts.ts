'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { prepareForExport } from '@/features/document/prepare-export'
import { useEditorInstance } from '@/features/editor/editor-context'
import { ZOOM_LEVELS } from '@/features/editor/page-geometry'
import { useSearch } from '@/features/editor/search-context'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { formatKeys, isMacPlatform, matchAppShortcut, type ShortcutId, shortcut } from './registry'

export function useIsMac(): boolean {
	const [mac, setMac] = useState(false)
	useEffect(function detectMacPlatform() {
		setMac(isMacPlatform())
	}, [])
	return mac
}

export function useShortcutLabel(): (id: ShortcutId) => string {
	const mac = useIsMac()
	return useCallback((id: ShortcutId) => formatKeys(shortcut(id).keys, mac), [mac])
}

function stepZoom(current: number, direction: 1 | -1): number {
	const index = ZOOM_LEVELS.indexOf(current as (typeof ZOOM_LEVELS)[number])
	const from = index === -1 ? ZOOM_LEVELS.indexOf(1) : index
	const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, from + direction))
	return ZOOM_LEVELS[next]
}

export function useAppShortcuts(): void {
	const mac = useIsMac()
	const { togglePanel } = usePanels()
	const { settings, update, toggleFocusMode, setShortcutsOpen, setPendingTabDelete } = useSettings()
	const { sessions, activeId, newSession, selectSession } = useSessions()
	const { openSearch, openPanelSearch } = useSearch()
	const { editor } = useEditorInstance()

	const handlers = useMemo<Partial<Record<ShortcutId, () => void>>>(() => {
		const stepTab = (direction: 1 | -1) => () => {
			if (sessions.length < 2) return
			const at = sessions.findIndex((session) => session.id === activeId)
			if (at === -1) return
			const next = (at + direction + sessions.length) % sessions.length
			selectSession(sessions[next].id)
		}

		return {
			'tools.proofreader': () => togglePanel('proofreader'),
			'tools.aiDetector': () => togglePanel('ai_detector'),
			'tools.aiRewriter': () => togglePanel('ai_rewriter'),
			'tools.humanizer': () => togglePanel('humanizer'),
			'tools.plagiarism': () => togglePanel('plagiarism'),

			'view.focusMode': toggleFocusMode,
			'view.ruler': () => update({ showRuler: !settings.showRuler }),
			'view.documentTabs': () => update({ showDocumentTabs: !settings.showDocumentTabs }),
			'view.zoomIn': () => update({ zoom: stepZoom(settings.zoom, 1) }),
			'view.zoomOut': () => update({ zoom: stepZoom(settings.zoom, -1) }),
			'view.zoomReset': () => update({ zoom: 1 }),
			'view.shortcuts': () => setShortcutsOpen(true),

			/* Ctrl+P lewat jalur yang sama dengan File › Cetak: diagram dan blok
			 * turunan disiapkan dulu. Dulu tidak ada penangannya, jadi cetak
			 * bawaan peramban yang berjalan tanpa persiapan itu. */
			'doc.print': () => {
				void prepareForExport(editor).then(() => window.print())
			},
			'doc.find': openSearch,
			'doc.findReplace': openPanelSearch,

			'doc.newTab': newSession,
			'doc.nextTab': stepTab(1),
			'doc.prevTab': stepTab(-1),
			'doc.closeTab': () => {
				if (activeId && sessions.length > 1) setPendingTabDelete(activeId)
			},
		}
	}, [
		togglePanel,
		toggleFocusMode,
		update,
		setShortcutsOpen,
		openSearch,
		openPanelSearch,
		settings.showRuler,
		settings.showDocumentTabs,
		settings.zoom,
		sessions,
		activeId,
		newSession,
		selectSession,
		setPendingTabDelete,
		editor,
	])

	useEffect(
		function bindGlobalShortcuts() {
			const onKeyDown = (event: KeyboardEvent) => {
				const matched = matchAppShortcut(event, mac)
				if (!matched) return

				const handler = handlers[matched.id]
				if (!handler) return

				event.preventDefault()
				handler()
			}

			window.addEventListener('keydown', onKeyDown)
			return () => window.removeEventListener('keydown', onKeyDown)
		},
		[mac, handlers],
	)
}
