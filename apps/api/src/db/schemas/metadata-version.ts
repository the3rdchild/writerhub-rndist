import { jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documentVersions } from './document-version'
import { poolRequest } from './pool-request'
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
