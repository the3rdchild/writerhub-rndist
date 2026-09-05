import { asc, eq } from 'drizzle-orm'
import db from '@/db'
import type { NewTemplate } from '@/db/schemas'
import { templates } from '@/db/schemas'

/**
 * Katalog template, disaring kategori bila diminta. Tidak ada penyaringan per
 * pengguna: seluruh isinya bawaan dan sama untuk semua orang.
 */
export async function findTemplates(category?: string) {
	return db
		.select()
		.from(templates)
		.where(category ? eq(templates.category, category) : undefined)
		.orderBy(asc(templates.category), asc(templates.position))
}

export async function findTemplateBySlug(slug: string) {
	const [row] = await db.select().from(templates).where(eq(templates.slug, slug)).limit(1)
	return row ?? null
}

/**
 * Upsert template berdasarkan slug: definisi bawaan ditulis sebagai kode dan
 * disalin ke tabel saat boot. Slug adalah satu-satunya identitas yang dipegang
 * pemanggil - `id` tidak pernah disebut di luar tabel ini.
 */
export async function upsertBuiltinTemplate(values: NewTemplate) {
	const [row] = await db
		.insert(templates)
		.values(values)
		.onConflictDoUpdate({
			target: templates.slug,
			set: {
				name: values.name,
				description: values.description,
				category: values.category,
				locale: values.locale,
				spec: values.spec,
				content: values.content,
				position: values.position,
			},
		})
		.returning()
	return row ?? null
}
