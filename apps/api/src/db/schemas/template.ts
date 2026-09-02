import type { TemplateSpec } from '@writer-hub/shared'
import { boolean, index, integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { identity } from './identity'

/**
 * Katalog template dokumen. Bawaan dan buatan pengguna hidup berdampingan di
 * tabel yang sama; bawaan di-upsert saat boot berdasarkan `slug` (lihat
 * `docs/TEMPLATE-GALLERY-PLAN.md` §2-§3).
 */
export const templates = pgTable(
	'templates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		slug: varchar('slug', { length: 64 }).notNull().unique(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		category: varchar('category', { length: 32 }).notNull(),
		locale: varchar('locale', { length: 8 }).notNull(),
		spec: jsonb('spec').notNull().$type<TemplateSpec>(),
		content: jsonb('content').notNull().$type<Record<string, unknown>>(),
		builtin: boolean('builtin').notNull().default(false),
		/** null untuk template bawaan/global. */
		owner_id: uuid('owner_id').references(() => identity.id, { onDelete: 'cascade' }),
		position: integer('position').notNull().default(0),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [
		index('templates_category_idx').on(table.category, table.position),
		index('templates_owner_idx').on(table.owner_id),
	],
)

export type Template = typeof templates.$inferSelect
export type NewTemplate = typeof templates.$inferInsert
