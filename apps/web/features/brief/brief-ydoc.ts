/**
 * Brief penelitian di Y.Doc lokal - di meta dokumen, sejajar dengan
 * `pageSetup` dan tipografinya. Satu brief per dokumen, bukan per tab: satu
 * skripsi tetap satu penelitian walau bab-babnya dipecah ke beberapa tab.
 */

import { normalizeBrief, type ResearchBrief } from '@writer-hub/shared'
import type * as Y from 'yjs'
import { docsRoot, LOCAL_ORIGIN } from '@/features/sessions/ydoc'
import { syncKey } from '@/features/sync/layout-sync'

const BRIEF = 'brief'

export function readDocBrief(doc: Y.Doc, docId: string): ResearchBrief | null {
	const raw = docsRoot(doc).meta.get(docId)?.get(BRIEF)
	return raw ? normalizeBrief(raw) : null
}

/**
 * Menulis hanya kalau isinya memang berbeda. Setiap penulisan ke Y.Doc adalah
 * suntingan yang menjadwalkan sinkronisasi ke server, dan panel menulis
 * setiap kali sebuah isian kehilangan fokus - sering tanpa mengubah apa pun.
 */
export function writeDocBrief(
	doc: Y.Doc,
	docId: string,
	brief: ResearchBrief | null,
	origin: unknown = LOCAL_ORIGIN,
): void {
	const entry = docsRoot(doc).meta.get(docId)
	if (!entry) return
	if (briefSyncKey(readDocBrief(doc, docId)) === briefSyncKey(brief)) return
	doc.transact(() => {
		if (brief) entry.set(BRIEF, brief)
		else entry.delete(BRIEF)
	}, origin)
}

export function briefSyncKey(brief: ResearchBrief | null): string {
	return syncKey(brief)
}
