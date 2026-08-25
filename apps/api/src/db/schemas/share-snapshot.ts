import { jsonb, pgTable, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { shares } from './share'

/**
 * Konten beku satu share link, relasi 1:1 (`share_id` unik) - terpisah dari
 * `shares` supaya payload besar (pohon dokumen/tab lengkap) tidak ikut
 * kebaca di query yang cuma butuh metadata link. Terpisah juga dari
 * `documents`/`document_tabs` LIVE: dokumen user bisa berubah/dihapus tanpa
 * memengaruhi link yang sudah tersebar.
 *
 * `content` adalah pohon `{ documents: [{ id, title, tabs: [{ id, title,
 * emoji, language, content }] }] }` - dibekukan apa adanya saat share dibuat,
 * backend tidak perlu memahami isinya lebih dari itu.
 */
export const shareSnapshots = pgTable('share_snapshots', {
	id: uuid('id').primaryKey().defaultRandom(),
	share_id: uuid('share_id')
		.notNull()
		.unique()
		.references(() => shares.id, { onDelete: 'cascade' }),
	content: jsonb('content').notNull().$type<Record<string, unknown>>(),

	created_at: timestamps.createdAt,
})

export type ShareSnapshot = typeof shareSnapshots.$inferSelect
export type NewShareSnapshot = typeof shareSnapshots.$inferInsert
