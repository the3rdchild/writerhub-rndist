import { pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documents } from './document'
import { shareSnapshots } from './share-snapshot'

export const shareAccessEnum = pgEnum('share_access', ['anyone', 'restricted'])
export const shareRoleEnum = pgEnum('share_role', ['viewer', 'commenter', 'editor'])

/**
 * Share link untuk satu dokumen. Token acak menjadi identitas publik yang
 * tertanam di URL `/share/<token>`. Konten yang dilihat publik diambil dari
 * `snapshot_id` (konten beku saat link dibuat); `document_id` hanya menunjuk
 * dokumen user sumbernya dan ikut kosong bila dokumen itu dihapus.
 */
export const shares = pgTable('shares', {
	id: uuid('id').primaryKey().defaultRandom(),
	document_id: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
	snapshot_id: uuid('snapshot_id').references(() => shareSnapshots.id, { onDelete: 'set null' }),
	token: varchar('token', { length: 255 }).notNull().unique(),
	access: shareAccessEnum('access').notNull(),
	role: shareRoleEnum('role').notNull(),
	created_by: varchar('created_by', { length: 255 }),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type Share = typeof shares.$inferSelect
export type NewShare = typeof shares.$inferInsert
