import { index, integer, jsonb, pgEnum, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { POOL_REQUEST_STATUS } from '@/constants/pool-request-status'
import { timestamps } from '@/db/utils/common-table'
import { documentTabs } from './document-tab'

export const poolRequestStatusEnum = pgEnum('pool_request_status', POOL_REQUEST_STATUS)

export const poolRequest = pgTable(
	'pool_request',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		job_id: varchar('job_id', { length: 255 }).notNull().unique(),
		status: poolRequestStatusEnum('status').notNull().default('pending'),
		error: text('error'),
		params: jsonb('params').$type<Record<string, unknown>>(),
		total_tokens: integer('total_tokens'),
		model_record_id: integer('model_record_id'),
		user_id: varchar('user_id', { length: 255 }),
		tab_id: uuid('tab_id').references(() => documentTabs.id, { onDelete: 'set null' }),
		feature: varchar('feature', { length: 50 }),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('pool_request_user_created_idx').on(table.user_id, table.created_at.desc())],
)

export type PoolRequest = typeof poolRequest.$inferSelect
export type NewPoolRequest = typeof poolRequest.$inferInsert
