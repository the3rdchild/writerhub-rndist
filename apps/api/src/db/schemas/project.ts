import { index, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { identity } from './identity'

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		owner_id: uuid('owner_id')
			.notNull()
			.references(() => identity.id),
		name: varchar('name', { length: 255 }).notNull(),
		color: varchar('color', { length: 32 }),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('projects_owner_idx').on(table.owner_id, table.updated_at.desc())],
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
