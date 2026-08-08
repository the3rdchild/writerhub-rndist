import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'

/**
 * Konten beku yang dibagikan lewat share link. Terpisah dari `documents`
 * supaya dokumen user bisa berubah/dihapus tanpa memengaruhi link yang
 * sudah tersebar.
 */
export const shareSnapshots = pgTable('share_snapshots', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	content: jsonb('content').notNull().$type<Record<string, unknown>>(),

	created_at: timestamps.createdAt,
})

export type ShareSnapshot = typeof shareSnapshots.$inferSelect
export type NewShareSnapshot = typeof shareSnapshots.$inferInsert
