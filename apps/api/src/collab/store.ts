import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { isPgError, PG_ERROR } from '@/constants/postgres-error'
import db from '@/db'
import {
	collabDocuments,
	collabUpdates,
	type DocumentTab,
	documents,
	documentTabs,
	type NewDocumentTab,
} from '@/db/schemas'
import { snapshotOf, stateVectorCovers, stateVectorsEqual } from './state-vector'

/**
 * Persistensi state Yjs per tab di Postgres.
 *
 * Model: log pembaruan yang hanya ditambah (`collab_updates`) plus satu baris
 * kepala per tab (`collab_documents`). Tidak ada "baca-ubah-tulis" seluruh
 * state pada setiap ketikan: naskah 20 MB yang ditulis ulang tiap 100 ms akan
 * menenggelamkan Postgres. Banyak proses boleh menambah log bersamaan; urutan
 * baris tidak penting karena pembaruan Yjs komutatif dan idempoten.
 */

export interface StoredCollabState {
	epoch: string
	contentSv: Uint8Array | null
	updates: Uint8Array[]
	rowCount: number
}

/** null = tab belum pernah disemai (belum kolaboratif). */
export async function loadCollabState(tabId: string): Promise<StoredCollabState | null> {
	// Satu snapshot untuk kepala dan lognya: tanpa itu reset + semai ulang di
	// antara dua kueri menghasilkan epoch lama dengan log generasi baru.
	return db.transaction(
		async (tx) => {
			const [head] = await tx
				.select({ epoch: collabDocuments.epoch, contentSv: collabDocuments.content_sv })
				.from(collabDocuments)
				.where(eq(collabDocuments.tab_id, tabId))
				.limit(1)
			if (!head) return null

			const rows = await tx
				.select({ update: collabUpdates.update })
				.from(collabUpdates)
				.where(and(eq(collabUpdates.tab_id, tabId), eq(collabUpdates.epoch, head.epoch)))
				.orderBy(asc(collabUpdates.id))
			return {
				epoch: head.epoch,
				contentSv: head.contentSv ?? null,
				updates: rows.map((row) => row.update),
				rowCount: rows.length,
			}
		},
		{ isolationLevel: 'repeatable read', accessMode: 'read only' },
	)
}

export async function tabExists(tabId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: documentTabs.id })
		.from(documentTabs)
		.where(eq(documentTabs.id, tabId))
		.limit(1)
	return Boolean(row)
}

export async function findCollabEpoch(tabId: string): Promise<string | null> {
	const [row] = await db
		.select({ epoch: collabDocuments.epoch })
		.from(collabDocuments)
		.where(eq(collabDocuments.tab_id, tabId))
		.limit(1)
	return row?.epoch ?? null
}

/**
 * @returns id baris log, atau `stale` bila generasi ini sudah tidak ada
 * (di-reset atau tabnya dihapus).
 */
export async function appendCollabUpdate(
	tabId: string,
	epoch: string,
	update: Uint8Array,
): Promise<number | 'stale'> {
	try {
		const [row] = await db
			.insert(collabUpdates)
			.values({ tab_id: tabId, epoch, update })
			.returning({ id: collabUpdates.id })
		return row?.id ?? 'stale'
	} catch (error) {
		if (isPgError(error, PG_ERROR.FOREIGN_KEY_VIOLATION)) return 'stale'
		throw error
	}
}

/** Satu baris log (pesan antar-instance yang hanya membawa rujukan); null bila sudah dipadatkan. */
export async function loadCollabUpdate(tabId: string, epoch: string, id: number): Promise<Uint8Array | null> {
	const [row] = await db
		.select({ update: collabUpdates.update })
		.from(collabUpdates)
		.where(and(eq(collabUpdates.id, id), eq(collabUpdates.tab_id, tabId), eq(collabUpdates.epoch, epoch)))
		.limit(1)
	return row?.update ?? null
}

/**
 * Penyemaian adalah satu-satunya gerbang dari "belum kolaboratif" ke
 * "kolaboratif", dan gerbangnya baris kepala itu sendiri: `ON CONFLICT DO
 * NOTHING` pada kunci primer membuat hanya SATU penyemai yang menang, apa pun
 * yang terjadi pada kunci Redis-nya. Naskah awalnya ditulis dalam transaksi
 * yang sama, jadi tidak pernah ada kepala tanpa isi.
 */
export async function seedCollabState(
	tabId: string,
	epoch: string,
	update: Uint8Array,
	seededBy: string | null,
): Promise<'seeded' | 'conflict' | 'gone'> {
	try {
		return await db.transaction(async (tx) => {
			const inserted = await tx
				.insert(collabDocuments)
				.values({ tab_id: tabId, epoch, seeded_by: seededBy })
				.onConflictDoNothing({ target: collabDocuments.tab_id })
				.returning({ epoch: collabDocuments.epoch })
			if (inserted.length === 0) return 'conflict'
			await tx.insert(collabUpdates).values({ tab_id: tabId, epoch, update })
			return 'seeded'
		})
	} catch (error) {
		// Tabnya sudah dihapus di antara tersambung dan menyemai.
		if (isPgError(error, PG_ERROR.FOREIGN_KEY_VIOLATION)) return 'gone'
		throw error
	}
}

export type DeriveResult =
	| { result: 'written'; documentId: string }
	| { result: 'unchanged' }
	/** State yang diturunkan tertinggal dari turunan tersimpan: pemanggil harus mengejar dari log. */
	| { result: 'behind' }
	/** Generasi sudah berganti atau tab sudah tidak ada. */
	| { result: 'stale' }

/**
 * Menulis `document_tabs.content` hasil turunan state Yjs.
 *
 * Beberapa proses bisa menurunkan tab yang sama; yang boleh menulis hanya
 * turunan yang state vector-nya mencakup turunan tersimpan. Tanpa penjaga
 * ini, proses yang tertinggal satu pesan pub/sub bisa menimpa isi yang lebih
 * baru - persis jenis kehilangan yang SHL-5 tutup.
 */
export async function writeDerivedContent(
	tabId: string,
	epoch: string,
	content: Record<string, unknown>,
	stateVector: Uint8Array,
): Promise<DeriveResult> {
	return db.transaction(async (tx) => {
		const [head] = await tx
			.select({ epoch: collabDocuments.epoch, contentSv: collabDocuments.content_sv })
			.from(collabDocuments)
			.where(eq(collabDocuments.tab_id, tabId))
			.for('update')
		if (!head || head.epoch !== epoch) return { result: 'stale' }
		if (stateVectorsEqual(head.contentSv, stateVector)) return { result: 'unchanged' }
		if (!stateVectorCovers(stateVector, head.contentSv)) return { result: 'behind' }

		const [tab] = await tx
			.update(documentTabs)
			.set({ content })
			.where(eq(documentTabs.id, tabId))
			.returning({ documentId: documentTabs.document_id })
		if (!tab) return { result: 'stale' }

		await tx.update(collabDocuments).set({ content_sv: stateVector }).where(eq(collabDocuments.tab_id, tabId))
		await tx.update(documents).set({ updated_at: new Date() }).where(eq(documents.id, tab.documentId))
		return { result: 'written', documentId: tab.documentId }
	})
}

/**
 * Memadatkan log satu tab menjadi satu baris. Yang dihapus PERSIS baris yang
 * dibaca (daftar id), bukan rentang id: baris yang ditulis proses lain di
 * tengah jalan - atau yang id-nya lebih kecil tapi baru ter-commit - tetap
 * utuh. Kunci advisory per tab mencegah dua proses memadatkan bersamaan.
 *
 * @returns jumlah baris yang digabung (0 bila tidak ada yang dikerjakan)
 */
export async function compactCollabUpdates(tabId: string, epoch: string): Promise<number> {
	return db.transaction(async (tx) => {
		const lock = await tx.execute<{ locked: boolean }>(
			sql`select pg_try_advisory_xact_lock(hashtextextended(${`collab:${tabId}`}, 0)) as locked`,
		)
		if (!lock[0]?.locked) return 0

		const rows = await tx
			.select({ id: collabUpdates.id, update: collabUpdates.update })
			.from(collabUpdates)
			.where(and(eq(collabUpdates.tab_id, tabId), eq(collabUpdates.epoch, epoch)))
			.orderBy(asc(collabUpdates.id))
		if (rows.length < 2) return 0

		await tx
			.insert(collabUpdates)
			.values({ tab_id: tabId, epoch, update: snapshotOf(rows.map((row) => row.update)) })
		await tx.delete(collabUpdates).where(
			inArray(
				collabUpdates.id,
				rows.map((row) => row.id),
			),
		)
		return rows.length
	})
}

/**
 * Menulis isi tab dari sisi server sambil membuang state Yjs-nya (log ikut
 * terhapus lewat kunci asing), dalam satu transaksi. Dipakai jalur yang
 * menulis `document_tabs.content` sendiri - pulihkan versi, draf - karena isi
 * barunya tidak bisa digabungkan ke state lama tanpa skema editor. Penyemai
 * berikutnya mengisi ulang room dari isi baru itu.
 *
 * Penurunan isi dari room mengunci baris kepala yang sama (`FOR UPDATE`),
 * jadi ia tidak bisa menyelip di antara dua langkah ini dan menimpa isi baru.
 */
export async function replaceContentResettingCollab(
	tabId: string,
	values: Partial<NewDocumentTab>,
): Promise<{ tab: DocumentTab | null; reset: boolean }> {
	return db.transaction(async (tx) => {
		const removed = await tx
			.delete(collabDocuments)
			.where(eq(collabDocuments.tab_id, tabId))
			.returning({ tabId: collabDocuments.tab_id })
		const [tab] = await tx.update(documentTabs).set(values).where(eq(documentTabs.id, tabId)).returning()
		return { tab: tab ?? null, reset: removed.length > 0 }
	})
}
