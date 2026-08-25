import { pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'

/**
 * Normalisasi identitas user lintas origin (client `pp-extended` vs
 * `ransel-ai`). `user_id` menyimpan id eksternal mentah (bisa non-UUID, mis.
 * `local-dev` di mode dev) - `id` adalah surrogate uuid yang dipakai sebagai
 * FK di tabel lain, supaya id eksternal yang sama dari origin berbeda tidak
 * pernah tertukar.
 */
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
