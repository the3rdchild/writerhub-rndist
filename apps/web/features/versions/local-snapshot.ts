import type * as Y from 'yjs'
import { fragmentToJSON } from '@/features/sync/serialize'
import {
	getLocalVersion,
	insertLocalVersion,
	type LocalVersionTrigger,
	listLocalVersions,
	pruneLocalIntervalVersions,
} from './local-store'
export const LOCAL_INTERVAL_SNAPSHOT_MS = 10 * 60_000
export function shouldSnapshotInterval(
	lastAt: number,
	lastJson: string,
	currentJson: string,
	now: number,
): boolean {
	if (now - lastAt <= LOCAL_INTERVAL_SNAPSHOT_MS) return false
	return lastJson !== currentJson
}

const lastByTab = new Map<string, { at: number; json: string }>()
const loadingTabs = new Set<string>()
export function rememberLocalSnapshot(tabId: string, at: number, json: string): void {
	lastByTab.set(tabId, { at, json })
}
export async function snapshotLocalVersion(
	doc: Y.Doc,
	tabId: string,
	trigger: LocalVersionTrigger,
	label?: string,
): Promise<boolean> {
	const content = fragmentToJSON(doc, tabId)
	try {
		const entry = await insertLocalVersion({ tabId, content, trigger, label })
		rememberLocalSnapshot(tabId, entry.createdAt, JSON.stringify(content))
		if (trigger === 'interval') await pruneLocalIntervalVersions(tabId)
		return true
	} catch {
		return false
	}
}
export async function maybeSnapshotLocalInterval(doc: Y.Doc, tabId: string): Promise<boolean> {
	const cached = lastByTab.get(tabId)
	if (cached) {
		const content = fragmentToJSON(doc, tabId)
		if (!shouldSnapshotInterval(cached.at, cached.json, JSON.stringify(content), Date.now())) {
			return false
		}
		return snapshotLocalVersion(doc, tabId, 'interval')
	}
	if (loadingTabs.has(tabId)) return false
	loadingTabs.add(tabId)
	try {
		const [latest] = await listLocalVersions(tabId)
		if (!latest) {
			return await snapshotLocalVersion(doc, tabId, 'interval')
		}
		const detail = await getLocalVersion(tabId, latest.id)
		rememberLocalSnapshot(tabId, latest.createdAt, JSON.stringify(detail?.content ?? null))
	} catch {
		return false
	} finally {
		loadingTabs.delete(tabId)
	}
	return maybeSnapshotLocalInterval(doc, tabId)
}
