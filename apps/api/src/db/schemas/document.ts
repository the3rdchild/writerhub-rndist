import type { DocumentMetadata, TabLayout } from '@writer-hub/shared'
import { index, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { projects } from './project'

export const documents = pgTable(
	'documents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		project_id: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'restrict' }),

		/** Template yang melahirkan dokumen ini; null untuk dokumen kosong. */
		template_slug: varchar('template_slug', { length: 64 }),
		/** Tata letak dasar dokumen; tab bisa menimpanya lewat `document_tabs.layout`. */
		layout: jsonb('layout').$type<TabLayout>(),
		/**
		 * Isian metadata milik template - judul, penulis, topik penelitian.
		 *
		 * Tersimpan di peladen, bukan hanya di Y.Doc, karena pembacanya juga ada
		 * di sini: system prompt AI Chat dan penyusun draf dibangun sisi peladen,
		 * dan itulah alasan utama metadata ini ada.
		 */
		metadata: jsonb('metadata').$type<DocumentMetadata>(),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('documents_project_idx').on(table.project_id, table.updated_at.desc())],
)

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
