'use client'

import type { CommentThread } from '@/features/sessions/types'
const STORAGE_KEY = 'writer-hub-comment-backup'
const MAX_ENTRIES = 60

interface BackupEntry {
	at: number
	threads: CommentThread[]
}

type BackupStore = Record<string, BackupEntry>

function read(): BackupStore {
	if (typeof window === 'undefined') return {}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return {}
		const parsed = JSON.parse(raw) as BackupStore
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch {
		return {}
	}
}

function write(store: BackupStore): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
	} catch {}
}
export function backupComments(serverTabId: string, threads: CommentThread[]): void {
	const store = read()

	if (threads.length === 0) {
		if (!(serverTabId in store)) return
		delete store[serverTabId]
		write(store)
		return
	}

	store[serverTabId] = { at: Date.now(), threads }
	const keys = Object.keys(store)
	if (keys.length > MAX_ENTRIES) {
		const stale = keys
			.sort((left, right) => store[left].at - store[right].at)
			.slice(0, keys.length - MAX_ENTRIES)
		for (const key of stale) delete store[key]
	}

	write(store)
}
export function restoreComments(serverTabId: string): CommentThread[] {
	const entry = read()[serverTabId]
	return Array.isArray(entry?.threads) ? entry.threads : []
}
