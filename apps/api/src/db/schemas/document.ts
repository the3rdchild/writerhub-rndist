import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { projects } from './project'

/**
 * Dokumen induk milik user: lapisan di atas tab (lihat
 * docs/DOCUMENT-TABS-RESTRUCTURE-PLAN.md). Membawa judul dan keanggotaan
 * proyek; naskahnya sendiri tinggal di `document_tabs`. Menghapus dokumen
 * menghapus seluruh tabnya (ON DELETE CASCADE di `document_tabs.document_id`).
 */
export const documents = pgTable(
	'documents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		owner_id: varchar('owner_id', { length: 255 }).notNull(),
		title: text('title').notNull(),
		// Proyek tempat dokumen bernaung; null berarti "Tanpa proyek". ON DELETE
		// SET NULL: menghapus proyek tidak menghapus dokumen di dalamnya.
		project_id: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('documents_owner_idx').on(table.owner_id, table.updated_at.desc())],
)

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
