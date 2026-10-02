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
/** Salinan lokal tab yang berbeda dari isi server saat tab itu pertama kali tersambung di peramban ini. */
export const FIRST_SYNC_LABEL = 'Local copy kept before live sync'

/** Naskah salinan yang dibuang, sebagai JSON editor; null bila kosong. */
export function discardedContent(doc: Y.Doc, schema: Schema): JSONContent | null {
	return fragmentContent(doc.getXmlFragment(COLLAB_FRAGMENT), schema)
}

/**
 * Isi satu fragmen sebagai JSON editor yang dinormalkan skema (bentuknya sama
 * untuk fragmen dari mana pun, jadi bisa dibandingkan); null bila kosong.
 */
export function fragmentContent(fragment: Y.XmlFragment, schema: Schema): JSONContent | null {
	const raw = yFragmentToProseMirrorJSON(fragment) as JSONContent
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

/**
 * Sama-tidaknya dua isi untuk keperluan cadangan. Paragraf kosong di ujung
 * diabaikan: editor menambahkannya sendiri (paragraf penutup), jadi salinan
 * yang isinya sama bisa berbeda di situ saja.
 */
export function sameContent(a: JSONContent | null, b: JSONContent | null): boolean {
	const trimmed = (content: JSONContent | null) => {
		const blocks = [...(content?.content ?? [])]
		while (blocks.length > 0) {
			const last = blocks[blocks.length - 1]
			if (last.type !== 'paragraph' || (last.content?.length ?? 0) > 0) break
			blocks.pop()
		}
		return JSON.stringify(blocks)
	}
	return trimmed(a) === trimmed(b)
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
	label = BACKUP_LABEL,
}: {
	content: JSONContent
	serverTabId: string
	/** Id tab lokal di Y.Doc besar, atau null (halaman tautan berbagi). */
	localTabId: string | null
	/** Hanya pemilik yang boleh menulis versi di server. */
	canUseServer: boolean
	label?: string
}): Promise<BackupResult> {
	const text = jsonPlainText(content, 200_000)
	let keptLocally = false
	try {
		await insertLocalVersion({
			tabId: localTabId ?? `collab:${serverTabId}`,
			content,
			trigger: 'pre_restore',
			label,
		})
		keptLocally = true
	} catch {}

	if (canUseServer) {
		try {
			await apiFetch(`/tabs/${encodeURIComponent(serverTabId)}/versions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label, content }),
			})
			return { kind: 'server' }
		} catch {}
	}
	return keptLocally ? { kind: 'local', text } : { kind: 'failed', text }
}
