import { integer, jsonb, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { documents } from './document'
import { timestamps } from '@/db/utils/common-table'

/**
 * Snapshot riwayat versi sebuah dokumen. Konten disimpan apa adanya sebagai
 * JSON Tiptap (ProseMirror), format sama dengan `documents.content`.
 * Versi immutable — tidak ada `updated_at`.
 */
export const versionTriggerEnum = pgEnum('version_trigger', [
	'manual',
	'interval',
	'pre_translate',
	'pre_restore',
])

export const documentVersions = pgTable('document_versions', {
	id: uuid('id').primaryKey().defaultRandom(),
	document_id: uuid('document_id')
		.notNull()
		.references(() => documents.id, { onDelete: 'cascade' }),
	content: jsonb('content').notNull().$type<Record<string, unknown>>(),
	trigger: versionTriggerEnum('trigger').notNull(),
	label: varchar('label', { length: 255 }),
	word_count: integer('word_count').notNull().default(0),
	created_by: varchar('created_by', { length: 255 }),

	created_at: timestamps.createdAt,
})

export type DocumentVersion = typeof documentVersions.$inferSelect
export type NewDocumentVersion = typeof documentVersions.$inferInsert
