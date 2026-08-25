import { sql } from 'drizzle-orm'
import { jsonb, pgTable, uuid } from 'drizzle-orm/pg-core'
import type { StyleMemory } from '@writer-hub/shared'
import { timestamps } from '@/db/utils/common-table'
import { identity } from './identity'

/**
 * AI Memory user: preferensi gaya yang ditulis eksplisit di Pengaturan.
 *
 * SATU baris per user dengan `preferences` jsonb - bukan tabel key/value.
 * Lingkupnya sudah dibatasi empat field (`StyleMemory`), dan key/value hanya
 * menambah query serta menggeser validasi ke runtime tanpa keuntungan nyata.
 */
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
