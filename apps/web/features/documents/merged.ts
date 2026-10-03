import type { DocMeta } from '@/features/sessions/ydoc'
import type { DocumentSummary } from './types'
export type DocumentOrigin = 'local-only' | 'synced' | 'server-only'

export interface MergedDocument {
	key: string
	localId: string | null
	serverId: string | null
	title: string
	updatedAt: number
	tabCount: number
	projectId: string | null
	origin: DocumentOrigin
}

export function mergeDocuments(
	local: readonly DocMeta[],
	server: readonly DocumentSummary[],
	serverIdOf: (localId: string) => string | null,
): MergedDocument[] {
	const byServerId = new Map(server.map((entry) => [entry.id, entry]))
	const claimed = new Set<string>()
	const merged: MergedDocument[] = []

	for (const dok of local) {
		const serverId = serverIdOf(dok.id)
		const row = serverId ? byServerId.get(serverId) : undefined

		if (row) claimed.add(row.id)

		merged.push({
			key: dok.id,
			localId: dok.id,
			serverId: row?.id ?? null,
			title: dok.title,
			updatedAt: Math.max(dok.updatedAt, row?.updatedAt ?? 0),
			tabCount: dok.tabOrder.length,
			projectId: row?.projectId ?? null,
			origin: row ? 'synced' : 'local-only',
		})
	}

	for (const row of server) {
		if (claimed.has(row.id)) continue
		merged.push({
			key: row.id,
			localId: null,
			serverId: row.id,
			title: row.title,
			updatedAt: row.updatedAt,
			tabCount: row.tabCount,
			projectId: row.projectId,
			origin: 'server-only',
		})
	}

	return merged.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function filterByProject(documents: readonly MergedDocument[], filter: string): MergedDocument[] {
	if (filter === 'all') return [...documents]
	if (filter === 'none') return documents.filter((dok) => dok.projectId === null)
	return documents.filter((dok) => dok.projectId === filter)
}

export type DocumentSort = 'modified' | 'name'

/** Judul tanpa beda huruf besar-kecil dan tanda diakritik ("Résumé" ≈ "resume"). */
function fold(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
}

/** Cari menurut judul: setiap kata di kueri harus muncul (SHL-11). */
export function searchDocuments(documents: readonly MergedDocument[], query: string): MergedDocument[] {
	const words = fold(query).split(/\s+/).filter(Boolean)
	if (words.length === 0) return [...documents]
	return documents.filter((dok) => {
		const title = fold(dok.title)
		return words.every((word) => title.includes(word))
	})
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortDocuments(documents: readonly MergedDocument[], sort: DocumentSort): MergedDocument[] {
	const sorted = [...documents]
	if (sort === 'name') sorted.sort((a, b) => byName.compare(a.title, b.title) || b.updatedAt - a.updatedAt)
	else sorted.sort((a, b) => b.updatedAt - a.updatedAt)
	return sorted
}
