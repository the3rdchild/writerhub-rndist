import type { AnalysisFeature, AnalysisResultData } from '@writer-hub/shared'
import { jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { poolRequest } from './pool-request'

/**
 * `result` menyimpan shape yang berbeda per feature (lihat AnalysisResultMap
 * di @writer-hub/shared); worker menulis, apps/web membaca apa adanya.
 */
export const analysisResult = pgTable('analysis_result', {
	id: uuid('id').primaryKey().defaultRandom(),
	job_id: varchar('job_id', { length: 255 }).notNull().unique(),
	request_id: uuid('request_id')
		.notNull()
		.references(() => poolRequest.id, { onDelete: 'cascade' }),
	feature: varchar('feature', { length: 50 }).$type<AnalysisFeature>().notNull(),
	result: jsonb('result').$type<AnalysisResultData>().notNull(),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type AnalysisResult = typeof analysisResult.$inferSelect
export type NewAnalysisResult = typeof analysisResult.$inferInsert

export type {
	AiDetectorResult,
	AiRewriterResult,
	AnalysisFeature,
	AnalysisResultData,
	HumanizerResult,
	PlagiarismResult,
} from '@writer-hub/shared'
