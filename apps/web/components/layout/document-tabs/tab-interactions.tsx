'use client'

import { createContext, type ReactNode, useContext, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { type Outline, scrollToOutlineItem, useOutline } from '@/features/editor/use-outline'
import { type Session, useSessions } from '@/features/sessions/session-context'
import { type SyncStatus, useSync } from '@/features/sync/sync-context'

/**
 * Seluruh keadaan dan aksi yang dibutuhkan satu baris tab.
 *
 * Sebelumnya semua ini diteruskan sebagai 24 prop terpisah dari sidebar ke
 * TabRow, sehingga menambah satu aksi berarti menyunting tiga tempat: keadaan
 * di induk, daftar prop di anak, dan pemanggilannya. Dikumpulkan di satu
 * context yang hidup sebatas sidebar ini - bukan provider global, karena tidak
 * ada bagian aplikasi lain yang berkepentingan.
 */
export interface TabInteractions {
	sessions: Session[]
	activeId: string | null
	renamingId: string | null
	pendingDelete: Session | null
	outline: Outline

	syncStatus: (tabId: string) => SyncStatus
	dropEdge: (tabId: string) => 'top' | 'bottom' | null
	isDragging: (tabId: string) => boolean

	select: (tab: Session) => void
	startRename: (tabId: string) => void
	cancelRename: () => void
	commitRename: (tabId: string, title: string) => void
	duplicate: (tabId: string) => void
	setIcon: (tabId: string, icon: string | null) => void
	toggleOutline: (tab: Session) => void
	move: (tabId: string, targetId: string) => void
	saveToCloud: (tabId: string) => void
	scrollToHeading: (pos: number) => void

	requestDelete: (tab: Session) => void
	confirmDelete: () => void
	cancelDelete: () => void

	dragStart: (tabId: string) => void
	dragEnter: (tabId: string) => void
	drop: (targetId: string) => void
	dragEnd: () => void
}

const TabInteractionsContext = createContext<TabInteractions | null>(null)

export function useTabInteractions(): TabInteractions {
	const value = useContext(TabInteractionsContext)
	if (!value) throw new Error('useTabInteractions dipakai di luar TabInteractionsProvider')
	return value
}

export function TabInteractionsProvider({ children }: { children: ReactNode }) {
	const {
		sessions,
		activeId,
		selectSession,
		renameSession,
		duplicateSession,
		deleteSession,
		setSessionEmoji,
		moveSession,
		setSessionOutlineExpanded,
	} = useSessions()
	const { syncStatus, saveToCloud } = useSync()
	const { editor } = useEditorInstance()
	const outline = useOutline(editor)

	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [pendingDelete, setPendingDelete] = useState<Session | null>(null)
	const [draggingId, setDraggingId] = useState<string | null>(null)
	const [dragOverId, setDragOverId] = useState<string | null>(null)

	const clearDrag = () => {
		setDraggingId(null)
		setDragOverId(null)
	}

	const value: TabInteractions = {
		sessions,
		activeId,
		renamingId,
		pendingDelete,
		outline,

		syncStatus,
		isDragging: (tabId) => draggingId === tabId,

		/**
		 * Garis penanda muncul di sisi tempat baris yang diseret akan mendarat:
		 * di bawah bila ia datang dari atas, di atas bila dari bawah.
		 */
		dropEdge: (tabId) => {
			if (dragOverId !== tabId || draggingId === null || draggingId === tabId) return null

			const from = sessions.findIndex((session) => session.id === draggingId)
			const to = sessions.findIndex((session) => session.id === tabId)
			return from < to ? 'bottom' : 'top'
		},

		// Mengklik tab yang sudah aktif membuka atau menutup daftar isinya,
		// bukan memilihnya ulang.
		select: (tab) => {
			if (tab.id === activeId) setSessionOutlineExpanded(tab.id, !tab.outlineExpanded)
			else selectSession(tab.id)
		},

		startRename: setRenamingId,
		cancelRename: () => setRenamingId(null),
		commitRename: (tabId, title) => {
			renameSession(tabId, title)
			setRenamingId(null)
		},

		duplicate: duplicateSession,
		setIcon: setSessionEmoji,
		toggleOutline: (tab) => setSessionOutlineExpanded(tab.id, !tab.outlineExpanded),
		move: moveSession,
		saveToCloud: (tabId) => void saveToCloud(tabId),
		scrollToHeading: (pos) => {
			if (editor) scrollToOutlineItem(editor, pos)
		},

		requestDelete: setPendingDelete,
		confirmDelete: () => {
			if (pendingDelete) deleteSession(pendingDelete.id)
			setPendingDelete(null)
		},
		cancelDelete: () => setPendingDelete(null),

		dragStart: setDraggingId,
		dragEnter: setDragOverId,
		drop: (targetId) => {
			if (draggingId) moveSession(draggingId, targetId)
			clearDrag()
		},
		dragEnd: clearDrag,
	}

	return <TabInteractionsContext.Provider value={value}>{children}</TabInteractionsContext.Provider>
}
