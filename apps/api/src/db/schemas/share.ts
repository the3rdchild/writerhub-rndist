import { pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documents } from './document'

export const shareAccessEnum = pgEnum('share_access', ['anyone', 'restricted'])
export const shareRoleEnum = pgEnum('share_role', ['viewer', 'commenter', 'editor'])

/**
 * Share link untuk satu DOKUMEN (seluruh tab di dalamnya - pola Google Docs:
 * "Share" membagikan satu file, bukan satu folder). Token acak menjadi
 * identitas publik yang tertanam di URL `/share/<token>`. BUKAN salinan beku
 * - kontennya dibaca LIVE dari `document_tabs` tiap kali link dibuka (lihat
 * `services/share/service.ts`), sama seperti Google Docs. Konsekuensinya:
 * `document_id` di-SET NULL kalau dokumennya dihapus, dan link itu ikut mati
 * (tidak ada lagi apa pun yang bisa ditampilkan).
 */
export const shares = pgTable('shares', {
	id: uuid('id').primaryKey().defaultRandom(),
	document_id: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
	token: varchar('token', { length: 255 }).notNull().unique(),
	access: shareAccessEnum('access').notNull(),
	role: shareRoleEnum('role').notNull(),
	created_by: varchar('created_by', { length: 255 }),

	updated_at: timestamps.updatedAt,
	created_at: timestamps.createdAt,
})

export type Share = typeof shares.$inferSelect
export type NewShare = typeof shares.$inferInsert
