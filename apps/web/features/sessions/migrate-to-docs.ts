'use client'

import * as Y from 'yjs'
import {
	clearLegacyTabOrder,
	createDocId,
	docsRoot,
	legacyTabOrder,
	LOCAL_ORIGIN,
	readDocs,
	tabsRoot,
} from './ydoc'
export function migrateTabsToDocs(doc: Y.Doc): boolean {
	const legacy = legacyTabOrder(doc)
	if (!legacy) return false

	const { meta: tabsMeta } = tabsRoot(doc)
	const registered = new Set(readDocs(doc).flatMap((dok) => dok.tabOrder))
	const pending = legacy.toArray().filter((id) => tabsMeta.has(id) && !registered.has(id))

	if (pending.length > 0) {
		doc.transact(() => {
			const { order, meta } = docsRoot(doc)
			for (const tabId of pending) {
				const tab = tabsMeta.get(tabId)
				const tabOrder = new Y.Array<string>()
				tabOrder.push([tabId])
				const entry = new Y.Map<unknown>()
				entry.set('title', (tab?.get('title') as string) ?? 'Untitled document')
				entry.set('tabOrder', tabOrder)
				entry.set('updatedAt', (tab?.get('updatedAt') as number) ?? Date.now())
				const docId = createDocId()
				meta.set(docId, entry)
				order.push([docId])
			}
		}, LOCAL_ORIGIN)
	}
	const readable = legacy
		.toArray()
		.filter((id) => tabsMeta.has(id))
		.every((id) => readDocs(doc).some((dok) => dok.tabOrder.includes(id)))
	if (!readable) return false

	clearLegacyTabOrder(doc)
	return pending.length > 0
}
