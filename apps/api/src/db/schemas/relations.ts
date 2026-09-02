import { relations } from 'drizzle-orm'
import { documents } from './document'
import { documentTabs } from './document-tab'
import { documentVersions } from './document-version'
import { identity } from './identity'
import { metadataVersion } from './metadata-version'
import { poolRequest } from './pool-request'
import { projects } from './project'
import { shares } from './share'
import { templates } from './template'
import { userMemories } from './user-memory'

/**
 * Relasi dikumpulkan di satu berkas, bukan ditempel di masing-masing tabel.
 * Menempelkannya berarti document.ts harus mengimpor document-tab.ts yang
 * sudah mengimpor document.ts - siklus impor ESM yang tidak perlu. Di sini
 * seluruh graf juga terbaca sekaligus.
 *
 * Semuanya menerjemahkan foreign key yang memang sudah ada lewat
 * .references(), jadi berkas ini tidak mengubah skema dan tidak butuh
 * migrasi baru. Fungsinya mengaktifkan db.query.<tabel>.findMany({ with }).
 */

export const identityRelations = relations(identity, ({ many, one }) => ({
	projects: many(projects),
	memory: one(userMemories),
	templates: many(templates),
}))

export const userMemoryRelations = relations(userMemories, ({ one }) => ({
	owner: one(identity, { fields: [userMemories.owner_id], references: [identity.id] }),
}))

export const projectRelations = relations(projects, ({ many, one }) => ({
	owner: one(identity, { fields: [projects.owner_id], references: [identity.id] }),
	documents: many(documents),
}))

export const documentRelations = relations(documents, ({ many, one }) => ({
	project: one(projects, { fields: [documents.project_id], references: [projects.id] }),
	tabs: many(documentTabs),
	shares: many(shares),
}))

export const shareRelations = relations(shares, ({ one }) => ({
	// document_id nullable dengan onDelete: 'set null' - tautan yang dokumennya
	// sudah dihapus tetap ada sebagai baris yatim, jadi sisi ini bisa null.
	document: one(documents, { fields: [shares.document_id], references: [documents.id] }),
}))

export const documentTabRelations = relations(documentTabs, ({ many, one }) => ({
	document: one(documents, { fields: [documentTabs.document_id], references: [documents.id] }),
	versions: many(documentVersions),
	poolRequests: many(poolRequest),
}))

export const documentVersionRelations = relations(documentVersions, ({ many, one }) => ({
	tab: one(documentTabs, { fields: [documentVersions.tab_id], references: [documentTabs.id] }),
	metadata: many(metadataVersion),
}))

export const poolRequestRelations = relations(poolRequest, ({ many, one }) => ({
	tab: one(documentTabs, { fields: [poolRequest.tab_id], references: [documentTabs.id] }),
	// Secara praktik satu job menulis tepat satu metadata_version, tapi yang
	// dijamin unik hanyalah job_id - request_id tidak punya constraint unik.
	// Jadi dideklarasikan many, sesuai yang benar-benar ditegakkan basis data.
	metadata: many(metadataVersion),
}))

export const metadataVersionRelations = relations(metadataVersion, ({ one }) => ({
	request: one(poolRequest, { fields: [metadataVersion.request_id], references: [poolRequest.id] }),
	// Nullable: hasil riset web tidak menghasilkan versi dokumen apa pun.
	version: one(documentVersions, {
		fields: [metadataVersion.version_id],
		references: [documentVersions.id],
	}),
}))

export const templateRelations = relations(templates, ({ one }) => ({
	owner: one(identity, { fields: [templates.owner_id], references: [identity.id] }),
}))
