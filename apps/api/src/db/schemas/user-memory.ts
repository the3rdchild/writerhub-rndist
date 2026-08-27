import type { StyleMemory } from '@writer-hub/shared'
import { sql } from 'drizzle-orm'
import { jsonb, pgTable, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { identity } from './identity'

export const userMemories = pgTable('user_memories', {
	owner_id: uuid('owner_id')
		.primaryKey()
		.references(() => identity.id),
	preferences: jsonb('preferences').$type<StyleMemory>().notNull().default(sql`'{}'::jsonb`),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type UserMemory = typeof userMemories.$inferSelect
export type NewUserMemory = typeof userMemories.$inferInsert
