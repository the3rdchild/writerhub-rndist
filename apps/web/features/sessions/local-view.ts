'use client'

import type { GrammarScores } from '@writer-hub/shared'
import type { EditorSuggestion } from '@/features/document/suggestions'
export const LOCAL_VIEW_STORAGE_KEY = 'writer-hub-view'

export interface TabViewState {
	outlineExpanded: boolean
	suggestions: EditorSuggestion[]
	scores: GrammarScores | null
}

export interface LocalView {
	activeDocId: string | null
	activeTabId: string | null
	tabs: Record<string, TabViewState>
}

export const EMPTY_LOCAL_VIEW: LocalView = { activeDocId: null, activeTabId: null, tabs: {} }

export const EMPTY_TAB_VIEW: TabViewState = {
	outlineExpanded: false,
	suggestions: [],
	scores: null,
}
export function storedActiveTabId(view: LocalView): string | null {
	return view.activeTabId ?? (view as LocalView & { activeId?: string | null }).activeId ?? null
}

export function tabView(view: LocalView, id: string | null): TabViewState {
	if (!id) return EMPTY_TAB_VIEW
	return view.tabs[id] ?? EMPTY_TAB_VIEW
}

export function patchTabView(
	view: LocalView,
	id: string,
	patch: Partial<TabViewState>,
): LocalView {
	return {
		...view,
		tabs: { ...view.tabs, [id]: { ...tabView(view, id), ...patch } },
	}
}
export function pruneTabViews(view: LocalView, existingIds: string[]): LocalView {
	const keep = new Set(existingIds)
	const tabs: Record<string, TabViewState> = {}
	for (const [id, state] of Object.entries(view.tabs)) {
		if (keep.has(id)) tabs[id] = state
	}
	return { ...view, tabs }
}
