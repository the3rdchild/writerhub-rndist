import { and, desc, eq, inArray } from 'drizzle-orm'
import db from '@/db'
import type { NewAsset } from '@/db/schemas'
import { assets, documentAssets } from '@/db/schemas'

export async function insertAsset(values: NewAsset) {
	const [row] = await db.insert(assets).values(values).returning()
	return row ?? null
}

export async function findAssetById(id: string) {
	const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1)
	return row ?? null
}

/** Dipakai dedupe unggahan: logo yang sama diunggah dua kali cukup satu baris. */
export async function findAssetByChecksum(projectId: string, checksum: string) {
	const [row] = await db
		.select()
		.from(assets)
		.where(and(eq(assets.project_id, projectId), eq(assets.checksum, checksum)))
		.limit(1)
	return row ?? null
}

export async function findAssetsByProject(projectId: string) {
	return db.select().from(assets).where(eq(assets.project_id, projectId)).orderBy(desc(assets.created_at))
}

export async function findAssetsByIds(ids: readonly string[]) {
	if (ids.length === 0) return []
	return db
		.select()
		.from(assets)
		.where(inArray(assets.id, [...ids]))
}

export async function deleteAsset(id: string) {
	const [row] = await db.delete(assets).where(eq(assets.id, id)).returning()
	return row ?? null
}

/** Aset mana yang dirujuk dokumen ini - dasar izin bagi pemegang share link. */
export async function findDocumentAssetIds(documentId: string): Promise<string[]> {
	const rows = await db
		.select({ id: documentAssets.asset_id })
		.from(documentAssets)
		.where(eq(documentAssets.document_id, documentId))
	return rows.map((row) => row.id)
}

/**
 * Menetapkan daftar aset yang dirujuk sebuah dokumen, menggantikan yang lama.
 *
 * Mengganti seluruhnya, bukan menambah: aset yang dihapus dari naskah harus
 * ikut kehilangan izinnya, dan itu tidak akan terjadi kalau tabelnya hanya
 * pernah bertambah. Dijalankan dalam satu transaksi supaya tidak ada jeda saat
 * dokumen tercatat tanpa aset sama sekali - jeda itu terlihat sebagai gambar
 * rusak oleh pembaca yang kebetulan memuat halaman saat itu.
 */
export async function setDocumentAssets(documentId: string, assetIds: readonly string[]): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(documentAssets).where(eq(documentAssets.document_id, documentId))
		if (assetIds.length === 0) return
		await tx
			.insert(documentAssets)
			.values([...new Set(assetIds)].map((id) => ({ document_id: documentId, asset_id: id })))
			.onConflictDoNothing()
	})
}
