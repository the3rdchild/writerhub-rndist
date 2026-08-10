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

/**
 * Migrasi struktur lama (urutan tab global di Y.Map('tabs')) ke struktur
 * dokumen, dijalankan sekali saat hidrasi - pola yang sama dengan
 * `migrate-legacy.ts`, hanya sumbernya di dalam Y.Doc itu sendiri.
 *
 * Tiap tab lama menjadi satu dokumen berisi tab itu; judul dan waktu sunting
 * tab disalin ke dokumennya. Naskah TIDAK disentuh: fragmen tetap bernama id
 * tab yang sama, jadi tidak ada yang perlu dipindahkan.
 *
 * Defensif karena data ini milik pengguna dan migrasinya tidak bisa diulang
 * kalau salah:
 *
 * - Kunci 'order' lama baru dihapus SETELAH setiap tabnya terbaca di dalam
 *   dokumennya. Kalau ada yang meleset, struktur lama dibiarkan utuh untuk
 *   dicoba lagi pada hidrasi berikutnya.
 * - Idempoten: tab yang sudah terdaftar di sebuah dokumen dilewati, jadi
 *   berjalan dua kali (atau melanjutkan migrasi yang terputus di tengah)
 *   tidak menggandakan apa pun. Yang menandai selesai adalah hilangnya kunci
 *   'order' lama.
 *
 * Mengembalikan `true` bila ada tab yang diangkat pada pemanggilan ini.
 */
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

	// Struktur lama baru boleh dibersihkan setelah setiap tab lama yang punya
	// meta terbaca di dalam dokumennya.
	const readable = legacy
		.toArray()
		.filter((id) => tabsMeta.has(id))
		.every((id) => readDocs(doc).some((dok) => dok.tabOrder.includes(id)))
	if (!readable) return false

	clearLegacyTabOrder(doc)
	return pending.length > 0
}
