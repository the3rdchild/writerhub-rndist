import { jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'

/**
 * Snapshot dokumen yang dibagikan. Satu dokumen bisa punya banyak share link
 * dengan akses/peran berbeda.
 */
export const documents = pgTable('documents', {
	id: uuid('id').primaryKey().defaultRandom(),
	owner_id: varchar('owner_id', { length: 255 }),
	title: text('title').notNull(),
	content: jsonb('content').notNull().$type<Record<string, unknown>>(),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
