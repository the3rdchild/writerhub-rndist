import { integer, jsonb, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { documentTabs } from './document-tab'
import { timestamps } from '@/db/utils/common-table'

/**
 * Snapshot riwayat versi sebuah TAB. Konten disimpan apa adanya sebagai
 * JSON Tiptap (ProseMirror), format sama dengan `document_tabs.content`.
 * Versi immutable - tidak ada `updated_at`.
 */
export const versionTriggerEnum = pgEnum('version_trigger', [
	'manual',
	'interval',
	'pre_translate',
	'pre_restore',
	// Snapshot otomatis saat job AI (grammar/analysis) selesai - lihat
	// `metadata-version.ts`.
	'ai_result',
])

export const documentVersions = pgTable('document_versions', {
	id: uuid('id').primaryKey().defaultRandom(),
	tab_id: uuid('tab_id')
		.notNull()
		.references(() => documentTabs.id, { onDelete: 'cascade' }),
	content: jsonb('content').notNull().$type<Record<string, unknown>>(),
	trigger: versionTriggerEnum('trigger').notNull(),
	label: varchar('label', { length: 255 }),
	word_count: integer('word_count').notNull().default(0),
	created_by: varchar('created_by', { length: 255 }),

	created_at: timestamps.createdAt,
})

export type DocumentVersion = typeof documentVersions.$inferSelect
export type NewDocumentVersion = typeof documentVersions.$inferInsert
