import type { JSONContent } from '@tiptap/core'
import type { VersionDetail, VersionSummary, VersionTrigger } from './types'
const DB_NAME = 'writer-hub-versions'
const STORE_NAME = 'versions'
const TAB_INDEX = 'tabId'
export type LocalVersionTrigger = Extract<VersionTrigger, 'manual' | 'interval' | 'pre_restore'>
export interface LocalVersionEntry {
	id: string
	tabId: string
	content: JSONContent
	trigger: LocalVersionTrigger
	label: string | null
	wordCount: number
	createdAt: number
}
export function countWords(content: JSONContent): number {
	let count = 0
	const walk = (node: JSONContent): void => {
		if (typeof node.text === 'string' && node.text.trim()) {
			count += node.text.trim().split(/\s+/).length
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child)
		}
	}
	walk(content)
	return count
}
export function selectIntervalIdsToPrune(
	versions: Pick<LocalVersionEntry, 'id' | 'trigger' | 'createdAt'>[],
	keep = 50,
): string[] {
	const intervals = versions
		.filter((version) => version.trigger === 'interval')
		.sort((a, b) => b.createdAt - a.createdAt)
	return intervals.slice(keep).map((version) => version.id)
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
	dbPromise ??= new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' }).createIndex(TAB_INDEX, 'tabId', {
					unique: false,
				})
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () =>
			reject(request.error ?? new Error('Gagal membuka penyimpanan versi lokal'))
	})
	return dbPromise
}
async function run<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await openDb()
	return new Promise<T>((resolve, reject) => {
		const request = action(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
		request.onsuccess = () => resolve(request.result)
		request.onerror = () =>
			reject(request.error ?? new Error('Operasi penyimpanan versi lokal gagal'))
	})
}
function readEntries(tabId: string): Promise<LocalVersionEntry[]> {
	return run('readonly', (store) => store.index(TAB_INDEX).getAll(tabId))
}

function toSummary(entry: LocalVersionEntry): VersionSummary {
	return {
		id: entry.id,
		trigger: entry.trigger,
		label: entry.label,
		wordCount: entry.wordCount,
		createdAt: entry.createdAt,
		feature: null,
	}
}
export async function listLocalVersions(tabId: string): Promise<VersionSummary[]> {
	const entries = await readEntries(tabId)
	return entries.sort((a, b) => b.createdAt - a.createdAt).map(toSummary)
}
export async function getLocalVersion(
	tabId: string,
	id: string,
): Promise<VersionDetail | null> {
	const entry = await run('readonly', (store) => store.get(id) as IDBRequest<LocalVersionEntry | undefined>)
	if (!entry || entry.tabId !== tabId) return null
	return { ...toSummary(entry), content: entry.content }
}
export async function insertLocalVersion(input: {
	tabId: string
	content: JSONContent
	trigger: LocalVersionTrigger
	label?: string | null
}): Promise<LocalVersionEntry> {
	const entry: LocalVersionEntry = {
		id: crypto.randomUUID(),
		tabId: input.tabId,
		content: input.content,
		trigger: input.trigger,
		label: input.label ?? null,
		wordCount: countWords(input.content),
		createdAt: Date.now(),
	}
	await run('readwrite', (store) => store.put(entry))
	return entry
}
export async function pruneLocalIntervalVersions(tabId: string, keep = 50): Promise<void> {
	const ids = selectIntervalIdsToPrune(await readEntries(tabId), keep)
	for (const id of ids) {
		await run('readwrite', (store) => store.delete(id))
	}
}
export async function deleteLocalVersionsForTab(tabId: string): Promise<void> {
	const keys = await run('readonly', (store) => store.index(TAB_INDEX).getAllKeys(tabId))
	for (const key of keys) {
		await run('readwrite', (store) => store.delete(key))
	}
}
export async function deleteLocalVersionsExcept(keepTabIds: ReadonlySet<string>): Promise<void> {
	const entries = await run('readonly', (store) => store.getAll() as IDBRequest<LocalVersionEntry[]>)
	const orphans = new Set(entries.map((entry) => entry.tabId))
	for (const tabId of orphans) {
		if (!keepTabIds.has(tabId)) await deleteLocalVersionsForTab(tabId)
	}
}
