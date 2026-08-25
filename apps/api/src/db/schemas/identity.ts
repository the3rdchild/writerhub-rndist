import { pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
export const identityOriginEnum = pgEnum('identity_origin', ['ransel', 'ppe'])

export const identity = pgTable(
	'identity',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		user_id: varchar('user_id', { length: 255 }).notNull(),
		origin: identityOriginEnum('origin').notNull(),

		created_at: timestamps.createdAt,
	},
	(table) => [uniqueIndex('identity_user_origin_idx').on(table.user_id, table.origin)],
)

export type Identity = typeof identity.$inferSelect
export type NewIdentity = typeof identity.$inferInsert
