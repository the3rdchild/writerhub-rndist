import { bigserial, customType, foreignKey, index, pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documentTabs } from './document-tab'

/** Kolom biner Postgres; postgres-js mengembalikannya sebagai Buffer. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
	dataType: () => 'bytea',
})

/**
 * Satu baris per tab server yang sudah punya state Yjs (sudah "disemai").
 * Tab tanpa baris di sini belum kolaboratif: isinya masih milik
 * `document_tabs.content` dan PUT per tab, seperti sebelum SHL-5.
 */
export const collabDocuments = pgTable(
	'collab_documents',
	{
		tab_id: uuid('tab_id')
			.primaryKey()
			.references(() => documentTabs.id, { onDelete: 'cascade' }),
		/**
		 * Generasi state. Berganti hanya saat state dibuang dan disemai ulang
		 * (pulihkan versi, draf menulis ulang tab). Klien yang memegang salinan
		 * dari generasi lain wajib membuangnya - menggabungkan dua generasi
		 * menggandakan seluruh naskah.
		 */
		epoch: uuid('epoch').notNull(),
		/**
		 * State vector yang menjadi dasar `document_tabs.content` terakhir.
		 * Turunan baru hanya boleh menimpa bila state vector-nya mencakup yang
		 * ini; turunan dari state yang tertinggal (pesan pub/sub terlambat)
		 * ditolak dan memicu pengejaran dari log.
		 */
		content_sv: bytea('content_sv'),
		seeded_by: varchar('seeded_by', { length: 255 }),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [unique('collab_documents_tab_epoch_key').on(table.tab_id, table.epoch)],
)

/**
 * Log pembaruan Yjs, hanya ditambah. Pemadatan menggabungkan sekumpulan baris
 * menjadi satu lalu menghapus PERSIS baris yang digabung (berdasarkan id,
 * bukan rentang), jadi baris yang ditulis proses lain di tengah pemadatan tidak
 * ikut terhapus.
 *
 * `(tab_id, epoch)` merujuk `collab_documents`: menghapus baris induk (reset)
 * ikut membuang lognya, dan tulisan susulan dari generasi lama ditolak oleh
 * kunci asing - bukan tercampur ke generasi baru.
 */
export const collabUpdates = pgTable(
	'collab_updates',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		tab_id: uuid('tab_id').notNull(),
		epoch: uuid('epoch').notNull(),
		update: bytea('update').notNull(),

		created_at: timestamps.createdAt,
	},
	(table) => [
		foreignKey({
			name: 'collab_updates_document_fk',
			columns: [table.tab_id, table.epoch],
			foreignColumns: [collabDocuments.tab_id, collabDocuments.epoch],
		}).onDelete('cascade'),
		index('collab_updates_tab_idx').on(table.tab_id, table.id),
	],
)

export type CollabDocument = typeof collabDocuments.$inferSelect
export type CollabUpdate = typeof collabUpdates.$inferSelect
