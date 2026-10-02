import type { JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import { yFragmentToProseMirrorJSON } from '@writer-hub/shared/collab-json'
import type * as Y from 'yjs'
import { jsonPlainText } from '@/features/editor/text-content'
import { insertLocalVersion } from '@/features/versions/local-store'
import { apiFetch } from '@/lib/api-client'

/**
 * Cadangan salinan yang harus dibuang (SHL-5, keputusan pemesan 3 Okt): state
 * tab di server di-reset (pulihkan versi, draf) sementara peramban ini masih
 * memegang salinan dengan suntingan yang mungkin belum terkirim. Salinan itu
 * TIDAK boleh hilang diam-diam - ia disimpan sebagai versi, dan penggunanya
 * diberi tahu.
 */

export const BACKUP_LABEL = 'Unsynced copy kept before reset'

/** Naskah salinan yang dibuang, sebagai JSON editor; null bila kosong. */
export function discardedContent(doc: Y.Doc, schema: Schema): JSONContent | null {
	const raw = yFragmentToProseMirrorJSON(doc.getXmlFragment(COLLAB_FRAGMENT)) as JSONContent
	let content: JSONContent = raw
	try {
		// Lewat skema supaya versinya berbentuk sama dengan versi lain; bila ada
		// simpul yang tidak dikenal skema, isi mentahnya tetap lebih baik daripada
		// tidak ada cadangan sama sekali.
		content = schema.nodeFromJSON(raw).toJSON() as JSONContent
	} catch {}
	const empty = !jsonPlainText(content, 1).trim() && !hasNonParagraphBlock(content)
	return empty ? null : content
}

/** Gambar, tabel, rumus: naskah tanpa teks pun bisa berisi sesuatu yang layak dicadangkan. */
function hasNonParagraphBlock(content: JSONContent): boolean {
	return (content.content ?? []).some((node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0)
}

export type BackupResult =
	/** Tersimpan di riwayat versi tab server - terlihat di panel Version history. */
	| { kind: 'server' }
	/** Hanya di peramban ini (server tidak terjangkau, atau tamu tautan berbagi). */
	| { kind: 'local'; text: string }
	| { kind: 'failed'; text: string }

/**
 * Simpan `content` sebagai versi: selalu di peramban ini (cepat, tahan luring),
 * lalu di server bila bisa supaya terlihat di riwayat versi tab cloud.
 */
export async function backupDiscardedCopy({
	content,
	serverTabId,
	localTabId,
	canUseServer,
}: {
	content: JSONContent
	serverTabId: string
	/** Id tab lokal di Y.Doc besar, atau null (halaman tautan berbagi). */
	localTabId: string | null
	/** Hanya pemilik yang boleh menulis versi di server. */
	canUseServer: boolean
}): Promise<BackupResult> {
	const text = jsonPlainText(content, 200_000)
	let keptLocally = false
	try {
		await insertLocalVersion({
			tabId: localTabId ?? `collab:${serverTabId}`,
			content,
			trigger: 'pre_restore',
			label: BACKUP_LABEL,
		})
		keptLocally = true
	} catch {}

	if (canUseServer) {
		try {
			await apiFetch(`/tabs/${encodeURIComponent(serverTabId)}/versions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label: BACKUP_LABEL, content }),
			})
			return { kind: 'server' }
		} catch {}
	}
	return keptLocally ? { kind: 'local', text } : { kind: 'failed', text }
}
