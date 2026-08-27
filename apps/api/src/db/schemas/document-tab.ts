import { index, integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documents } from './document'

export const documentTabs = pgTable(
	'document_tabs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		document_id: uuid('document_id')
			.notNull()
			.references(() => documents.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		content: jsonb('content').notNull().$type<Record<string, unknown>>(),
		emoji: varchar('emoji', { length: 32 }),
		language: varchar('language', { length: 32 }),
		position: integer('position').notNull().default(0),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('document_tabs_document_idx').on(table.document_id, table.position)],
)

export type DocumentTab = typeof documentTabs.$inferSelect
export type NewDocumentTab = typeof documentTabs.$inferInsert
