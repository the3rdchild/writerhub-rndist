import { jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documentVersions } from './document-version'
import { poolRequest } from './pool-request'

/**
 * Hasil job AI (grammar + 6 analysis feature), satu baris per job, menempel
 * ke snapshot `document_versions` yang dibuat worker saat job itu selesai
 * (trigger `ai_result`) - gantikan `grammar_result`/`analysis_result` lama
 * yang menempel ke `pool_request`.
 *
 * `feature` generik ('grammar' | 6 nama AnalysisFeature dari @writer-hub/shared)
 * dengan `result` jsonb bebas bentuk per feature - grammar melipat field
 * lamanya (original_text/corrected_text/scores/suggestions/dst) jadi satu
 * object di sini, bukan kolom sendiri-sendiri.
 *
 * `request_id`/`job_id` dipertahankan (bukan cuma `version_id` seperti di
 * ERD) supaya endpoint yang lookup by job (SSE stream, Aktivitas AI) tidak
 * perlu didesain ulang total.
 */
export const metadataVersion = pgTable('metadata_version', {
	id: uuid('id').primaryKey().defaultRandom(),
	job_id: varchar('job_id', { length: 255 }).notNull().unique(),
	request_id: uuid('request_id')
		.notNull()
		.references(() => poolRequest.id, { onDelete: 'cascade' }),
	version_id: uuid('version_id')
		.notNull()
		.references(() => documentVersions.id, { onDelete: 'cascade' }),
	feature: varchar('feature', { length: 50 }).notNull(),
	result: jsonb('result').notNull().$type<Record<string, unknown>>(),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type MetadataVersion = typeof metadataVersion.$inferSelect
export type NewMetadataVersion = typeof metadataVersion.$inferInsert
