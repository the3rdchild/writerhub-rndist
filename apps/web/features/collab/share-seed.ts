import type { Schema } from '@tiptap/pm/model'
import { fetchShare } from '@/features/share/api'
import type { SharePayload } from '@/features/share/types'
import { seedUpdateFromJSON } from './seed'

/**
 * Semaian dari halaman tautan berbagi: SELALU naskah server saat ini, tidak
 * pernah muatan halaman. Muatan itu dibaca saat halaman dibuka dan bisa sudah
 * basi - terutama setelah pemilik memulihkan versi: semua klien diputus
 * (4409), tamu tanpa salinan lokal biasanya tiba lebih dulu di room yang
 * kosong, dan semaian dari muatannya menimpa versi yang baru dipulihkan.
 *
 * Saat room kosong, `document_tabs.content` adalah isi yang berlaku (pulihkan
 * versi menulisnya bersamaan dengan membuang state Yjs). Bila tidak bisa
 * diambil, tamu tidak menyemai (null) dan server memberi giliran ke klien lain.
 */
export async function seedFromShare({
	shareToken,
	serverTabId,
	schema,
	fetchPayload = fetchShare,
}: {
	shareToken: string
	serverTabId: string
	schema: Schema
	fetchPayload?: (token: string) => Promise<Pick<SharePayload, 'tabs'>>
}): Promise<Uint8Array | null> {
	try {
		const payload = await fetchPayload(shareToken)
		const tab = payload.tabs.find((candidate) => candidate.id === serverTabId)
		return tab?.content ? seedUpdateFromJSON(tab.content, schema) : null
	} catch {
		return null
	}
}
