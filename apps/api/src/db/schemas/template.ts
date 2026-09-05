import type { TemplateSpec } from '@writer-hub/shared'
import { index, integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'

/**
 * Katalog template dokumen. Seluruh isinya bawaan: ditulis sebagai kode di
 * `services/templates/catalog/` dan di-upsert saat boot berdasarkan `slug`.
 *
 * Tabel ini sengaja TIDAK punya kolom pemilik. Tidak ada "template saya" -
 * pengguna yang punya format sendiri mengimpor DOCX-nya lewat jalur impor biasa
 * dan menyunting dari situ, tanpa melahirkan baris di sini. Format per
 * universitas ditulis tangan sebagai template bawaan, dengan slug berawalan
 * institusi (`unpad-ta1-elektro`). Alasan lengkapnya di `docs/erd.dbml`.
 */
export const templates = pgTable(
	'templates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		slug: varchar('slug', { length: 64 }).notNull().unique(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		category: varchar('category', { length: 32 }).notNull(),
		locale: varchar('locale', { length: 8 }).notNull(),
		spec: jsonb('spec').notNull().$type<TemplateSpec>(),
		content: jsonb('content').notNull().$type<Record<string, unknown>>(),
		position: integer('position').notNull().default(0),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('templates_category_idx').on(table.category, table.position)],
)

export type Template = typeof templates.$inferSelect
export type NewTemplate = typeof templates.$inferInsert
