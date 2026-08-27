import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { projects } from './project'

export const documents = pgTable(
	'documents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		project_id: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'restrict' }),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('documents_project_idx').on(table.project_id, table.updated_at.desc())],
)

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
