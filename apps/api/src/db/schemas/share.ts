import { pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { projects } from './project'

export const shareAccessEnum = pgEnum('share_access', ['anyone', 'restricted'])
export const shareRoleEnum = pgEnum('share_role', ['viewer', 'commenter', 'editor'])

/**
 * Share link untuk satu PROYEK (seluruh dokumen + tab di dalamnya). Token
 * acak menjadi identitas publik yang tertanam di URL `/share/<token>`.
 * Konten yang dilihat publik diambil dari snapshot beku (`share_snapshots`,
 * relasi 1:1 lewat `share_id`) - `project_id` cuma menunjuk proyek sumbernya
 * dan ikut kosong bila proyek itu dihapus, snapshot-nya tetap hidup.
 */
export const shares = pgTable('shares', {
	id: uuid('id').primaryKey().defaultRandom(),
	project_id: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
	token: varchar('token', { length: 255 }).notNull().unique(),
	access: shareAccessEnum('access').notNull(),
	role: shareRoleEnum('role').notNull(),
	created_by: varchar('created_by', { length: 255 }),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type Share = typeof shares.$inferSelect
export type NewShare = typeof shares.$inferInsert
