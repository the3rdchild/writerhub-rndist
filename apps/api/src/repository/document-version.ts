import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import db from '@/db'
import { documentVersions } from '@/db/schemas'
import type { NewDocumentVersion } from '@/db/schemas'

/**
 * Akses tabel `document_versions`. Kepemilikan tidak dicek di sini — service
 * wajib memverifikasi dokumen milik user lewat `findDocumentById` dulu.
 */

/** Metadata versi sebuah dokumen (tanpa `content`), terbaru di atas. */
export async function findVersionsByDocument(documentId: string) {
	return db
		.select({
			id: documentVersions.id,
			trigger: documentVersions.trigger,
			label: documentVersions.label,
			wordCount: documentVersions.word_count,
			createdAt: documentVersions.created_at,
		})
		.from(documentVersions)
		.where(eq(documentVersions.document_id, documentId))
		.orderBy(desc(documentVersions.created_at))
}

/** Satu versi lengkap dengan kontennya, diskop ke dokumennya. */
export async function findVersionById(versionId: string, documentId: string) {
	const [row] = await db
		.select()
		.from(documentVersions)
		.where(and(eq(documentVersions.id, versionId), eq(documentVersions.document_id, documentId)))
		.limit(1)
	return row ?? null
}

export async function insertVersion(values: NewDocumentVersion) {
	const [row] = await db.insert(documentVersions).values(values).returning()
	return row ?? null
}

/**
 * Versi terbaru — untuk keputusan snapshot interval. Sengaja tanpa `content`:
 * perbandingan isinya dilakukan di database lewat `versionContentEquals`.
 */
export async function findLatestVersion(documentId: string) {
	const [row] = await db
		.select({ id: documentVersions.id, createdAt: documentVersions.created_at })
		.from(documentVersions)
		.where(eq(documentVersions.document_id, documentId))
		.orderBy(desc(documentVersions.created_at))
		.limit(1)
	return row ?? null
}

/**
 * Apakah isi sebuah versi sama dengan `content`?
 *
 * Perbandingannya diserahkan ke Postgres (`jsonb = jsonb`), **bukan**
 * `JSON.stringify` di sisi JS: jsonb menormalkan urutan kunci saat menyimpan
 * (kunci lebih pendek dulu, lalu bytewise), sehingga setiap node teks Tiptap
 * kembali sebagai `{"text":…,"type":…}` padahal dikirim `{"type":…,"text":…}`.
 * Membandingkan sebagai string karena itu tidak pernah cocok untuk naskah nyata.
 */
export async function versionContentEquals(
	versionId: string,
	content: Record<string, unknown>,
): Promise<boolean> {
	const [row] = await db
		.select({ id: documentVersions.id })
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.id, versionId),
				sql`${documentVersions.content} = ${JSON.stringify(content)}::jsonb`,
			),
		)
		.limit(1)
	return row !== undefined
}

/** Hapus versi `interval` di luar `keep` terbaru; versi lain tidak dipangkas. */
export async function pruneIntervalVersions(documentId: string, keep = 50) {
	const stale = db
		.select({ id: documentVersions.id })
		.from(documentVersions)
		.where(and(eq(documentVersions.document_id, documentId), eq(documentVersions.trigger, 'interval')))
		.orderBy(desc(documentVersions.created_at))
		.offset(keep)

	return db
		.delete(documentVersions)
		.where(
			and(
				eq(documentVersions.document_id, documentId),
				eq(documentVersions.trigger, 'interval'),
				inArray(documentVersions.id, stale),
			),
		)
}
