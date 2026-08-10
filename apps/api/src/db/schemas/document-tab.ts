import { index, integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documents } from './document'

/**
 * Satu tab naskah di dalam dokumen induk. Tabel ini adalah tabel `documents`
 * lama yang diganti nama di migrasi 0009 - riwayat versi, share, dan aktivitas
 * AI tetap menunjuk ke sini (kolom mereka kini bernama `tab_id`).
 * Konten disimpan apa adanya sebagai JSON Tiptap (ProseMirror); backend tidak
 * perlu memahami strukturnya.
 */
export const documentTabs = pgTable(
	'document_tabs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// Dokumen induk tab ini. ON DELETE CASCADE: menghapus dokumen menghapus
		// seluruh tabnya.
		document_id: uuid('document_id')
			.notNull()
			.references(() => documents.id, { onDelete: 'cascade' }),
		owner_id: varchar('owner_id', { length: 255 }).notNull(),
		title: text('title').notNull(),
		content: jsonb('content').notNull().$type<Record<string, unknown>>(),
		emoji: varchar('emoji', { length: 32 }),
		language: varchar('language', { length: 32 }),
		// Urutan tab di dalam dokumen induknya (0 = paling kiri).
		position: integer('position').notNull().default(0),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('document_tabs_document_idx').on(table.document_id, table.position)],
)

export type DocumentTab = typeof documentTabs.$inferSelect
export type NewDocumentTab = typeof documentTabs.$inferInsert
