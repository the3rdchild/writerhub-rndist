import { jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { projects } from './project'

/**
 * Dokumen milik user. Konten disimpan apa adanya sebagai JSON Tiptap
 * (ProseMirror); backend tidak perlu memahami strukturnya.
 */
export const documents = pgTable('documents', {
	id: uuid('id').primaryKey().defaultRandom(),
	owner_id: varchar('owner_id', { length: 255 }).notNull(),
	title: text('title').notNull(),
	content: jsonb('content').notNull().$type<Record<string, unknown>>(),
	emoji: varchar('emoji', { length: 32 }),
	language: varchar('language', { length: 32 }),
	// Proyek tempat dokumen bernaung; null berarti "Tanpa proyek". ON DELETE
	// SET NULL: menghapus proyek tidak menghapus dokumen di dalamnya.
	project_id: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
