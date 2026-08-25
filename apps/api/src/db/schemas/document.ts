import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { projects } from './project'

/**
 * Dokumen induk milik user: lapisan di atas tab (lihat
 * docs/DOCUMENT-TABS-RESTRUCTURE-PLAN.md). Membawa judul dan keanggotaan
 * proyek; naskahnya sendiri tinggal di `document_tabs`. Menghapus dokumen
 * menghapus seluruh tabnya (ON DELETE CASCADE di `document_tabs.document_id`).
 *
 * Kepemilikan TIDAK disimpan di sini - setiap dokumen wajib punya proyek
 * (tidak ada lagi state "Tanpa proyek"), dan pemiliknya diturunkan lewat
 * `project_id -> projects.owner_id`.
 */
export const documents = pgTable(
	'documents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		// ON DELETE RESTRICT: proyek tidak boleh dihapus selagi masih berisi
		// dokumen (project_id wajib ada, jadi "set null" tidak berlaku lagi) -
		// user harus memindahkan/menghapus dokumennya dulu.
		project_id: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'restrict' }),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [index('documents_project_idx').on(table.project_id, table.updated_at.desc())],
)

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
