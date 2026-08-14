import { index, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'

/**
 * Proyek milik user: pengelompokan dokumen di File Library. Menghapus proyek
 * tidak menghapus dokumen di dalamnya - `documents.project_id` diset null
 * (lihat skema `documents`), dokumennya kembali ke "Tanpa proyek".
 */
export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		owner_id: varchar('owner_id', { length: 255 }).notNull(),
		name: varchar('name', { length: 255 }).notNull(),
		color: varchar('color', { length: 32 }),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('projects_owner_idx').on(table.owner_id, table.updated_at.desc())],
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
