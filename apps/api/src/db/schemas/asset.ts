import { char, index, integer, pgTable, primaryKey, uuid, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '@/db/utils/common-table'
import { documents } from './document'
import { identity } from './identity'
import { projects } from './project'

/**
 * Gambar milik sebuah proyek: logo, foto, ikon, tekstur - bahan yang dipakai
 * ulang di banyak dokumen dalam proyek yang sama.
 *
 * Kepemilikannya proyek, dan itu memang yang membuatnya berguna sebagai
 * pustaka. Tapi kepemilikan **bukan** pemberian akses: siapa yang boleh
 * menerbitkan URL untuk sebuah aset ditentukan `document_assets` di bawah, dan
 * alasannya ada di sana.
 *
 * Aset pustaka bawaan tidak disimpan di sini. Ia global dan publik menurut
 * definisinya, tanpa `project_id` dan tanpa jalur otorisasi - mencampurnya
 * berarti membayar ongkos tanda tangan untuk berkas yang boleh dilihat siapa
 * saja.
 */
export const assets = pgTable(
	'assets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		project_id: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		/** Kunci objek di penyimpanan; bukan URL - URL selalu diterbitkan saat diminta. */
		key: varchar('key', { length: 512 }).notNull(),
		mime: varchar('mime', { length: 127 }).notNull(),
		bytes: integer('bytes').notNull(),
		/** Ukuran hakiki gambar, dipakai penata letak supaya tidak perlu memuat berkasnya. */
		width: integer('width'),
		height: integer('height'),
		/** Nama yang dilihat pengguna di pustaka, bukan nama berkas di disk. */
		name: varchar('name', { length: 255 }).notNull(),
		/**
		 * SHA-256 isi berkas. Unik per proyek: mengunggah logo yang sama dua kali
		 * mengembalikan baris yang sudah ada, bukan menambah salinan. Pustaka yang
		 * dipakai berulang menumpuk duplikat dengan sangat cepat tanpa ini.
		 */
		checksum: char('checksum', { length: 64 }).notNull(),
		created_by: uuid('created_by').references(() => identity.id),

		updated_at: timestamps.updatedAt,
		created_at: timestamps.createdAt,
	},
	(table) => [
		index('assets_project_idx').on(table.project_id, table.created_at.desc()),
		index('assets_project_checksum_idx').on(table.project_id, table.checksum),
	],
)

/**
 * Aset mana yang benar-benar dirujuk sebuah dokumen.
 *
 * Tabel ini ada murni untuk keamanan, dan tanpanya scope proyek bocor.
 * Skenarionya: dokumen A dan B ada di proyek P; A dibagikan dengan
 * `share_access = 'anyone'`, yaitu tautan publik tanpa autentikasi. Kalau izin
 * menerbitkan URL mengikuti kepemilikan proyek, siapa pun yang membuka tautan
 * itu bisa meminta URL untuk **seluruh** aset P - termasuk yang hanya dipakai
 * B, yang tidak pernah dibagikan.
 *
 * Jadi ada dua aturan yang berbeda, dan keduanya ada di `services/assets`:
 * pemilik proyek boleh menerbitkan URL untuk aset mana pun miliknya (ia memang
 * perlu menelusuri pustakanya), sementara pemegang share link hanya untuk aset
 * yang tercatat di sini bagi dokumen itu.
 */
export const documentAssets = pgTable(
	'document_assets',
	{
		document_id: uuid('document_id')
			.notNull()
			.references(() => documents.id, { onDelete: 'cascade' }),
		asset_id: uuid('asset_id')
			.notNull()
			.references(() => assets.id, { onDelete: 'cascade' }),

		created_at: timestamps.createdAt,
	},
	(table) => [
		primaryKey({ columns: [table.document_id, table.asset_id] }),
		index('document_assets_asset_idx').on(table.asset_id),
	],
)

export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert
export type DocumentAsset = typeof documentAssets.$inferSelect
