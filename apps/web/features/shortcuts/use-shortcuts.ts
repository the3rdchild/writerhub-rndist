'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { ZOOM_LEVELS } from '@/features/editor/page-geometry'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import {
	formatKeys,
	isMacPlatform,
	matchAppShortcut,
	shortcut,
	type ShortcutId,
} from './registry'

/**
 * Apakah sedang berjalan di macOS.
 *
 * Selalu `false` pada render pertama supaya hasil server dan klien identik;
 * lambang ⌘ baru menggantikan "Ctrl" setelah mount. Menebaknya saat render akan
 * membuat hidrasi tidak cocok.
 */
export function useIsMac(): boolean {
	const [mac, setMac] = useState(false)
	useEffect(() => setMac(isMacPlatform()), [])
	return mac
}

/** Label pintasan siap tampil, mis. "Ctrl+Shift+1" atau "⌘⇧1". */
export function useShortcutLabel(): (id: ShortcutId) => string {
	const mac = useIsMac()
	return useCallback((id: ShortcutId) => formatKeys(shortcut(id).keys, mac), [mac])
}

/** Naik atau turun satu tingkat pada daftar perbesaran yang tersedia. */
function stepZoom(current: number, direction: 1 | -1): number {
	const index = ZOOM_LEVELS.indexOf(current as (typeof ZOOM_LEVELS)[number])
	// Nilai di luar daftar (mis. dari versi lama) diperlakukan sebagai 100%.
	const from = index === -1 ? ZOOM_LEVELS.indexOf(1) : index
	const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, from + direction))
	return ZOOM_LEVELS[next]
}

/**
 * Pintasan yang bekerja di seluruh aplikasi, bukan hanya di dalam editor.
 *
 * Semuanya memakai Mod plus Shift atau Alt, jadi tidak pernah bertabrakan
 * dengan pengetikan biasa dan tidak perlu memeriksa elemen mana yang sedang
 * fokus. Yang cocok selalu `preventDefault` — termasuk perbesaran, yang memang
 * dimaksudkan menggantikan zoom bawaan browser selama berada di aplikasi.
 */
export function useAppShortcuts(): void {
	const mac = useIsMac()
	const { togglePanel } = usePanels()
	const { settings, update, toggleFocusMode, setShortcutsOpen } = useSettings()
	const { sessions, activeId, newSession, selectSession, deleteSession } = useSessions()

	const handlers = useMemo<Partial<Record<ShortcutId, () => void>>>(() => {
		const stepTab = (direction: 1 | -1) => () => {
			if (sessions.length < 2) return
			const at = sessions.findIndex((session) => session.id === activeId)
			if (at === -1) return
			// Berputar di ujung: dari tab terakhir maju berarti kembali ke yang pertama.
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

			'doc.newTab': newSession,
			'doc.nextTab': stepTab(1),
			'doc.prevTab': stepTab(-1),
			'doc.closeTab': () => {
				// Menutup tab terakhir akan mengosongkan naskah tanpa diminta;
				// lebih baik tidak terjadi karena salah tekan.
				if (activeId && sessions.length > 1) deleteSession(activeId)
			},
		}
	}, [
		togglePanel,
		toggleFocusMode,
		update,
		setShortcutsOpen,
		settings.showRuler,
		settings.showDocumentTabs,
		settings.zoom,
		sessions,
		activeId,
		newSession,
		selectSession,
		deleteSession,
	])

	useEffect(() => {
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
	}, [mac, handlers])
}
