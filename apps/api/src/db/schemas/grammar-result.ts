import type { GrammarScores, GrammarSuggestion } from '@writer-hub/shared'
import { integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { poolRequest } from './pool-request'

/**
 * Kolom jsonb di sini ditulis worker dan dikonsumsi apps/web apa adanya,
 * jadi tipenya diambil dari kontrak bersama (@writer-hub/shared).
 */
export const grammarResult = pgTable('grammar_result', {
	id: uuid('id').primaryKey().defaultRandom(),
	job_id: varchar('job_id', { length: 255 }).notNull().unique(),
	request_id: uuid('request_id')
		.notNull()
		.references(() => poolRequest.id, { onDelete: 'cascade' }),
	original_text: text('original_text').notNull(),
	corrected_text: text('corrected_text'),
	suggestions: jsonb('suggestions').$type<GrammarSuggestion[]>(),
	scores: jsonb('scores').$type<GrammarScores>(),
	writing_quality: integer('writing_quality'),
	quality_label: varchar('quality_label', { length: 50 }),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type GrammarResult = typeof grammarResult.$inferSelect
export type NewGrammarResult = typeof grammarResult.$inferInsert

export type { GrammarScores, GrammarSuggestion, SuggestionCategory } from '@writer-hub/shared'
