import { and, asc, eq, isNull, or } from 'drizzle-orm'
import db from '@/db'
import type { NewTemplate } from '@/db/schemas'
import { templates } from '@/db/schemas'

/** Template yang terlihat pengguna: bawaan/global plus miliknya sendiri. */
export async function findVisibleTemplates(ownerId: string, category?: string) {
	const conditions = [or(isNull(templates.owner_id), eq(templates.owner_id, ownerId))]
	if (category) conditions.push(eq(templates.category, category))

	return db
		.select()
		.from(templates)
		.where(and(...conditions))
		.orderBy(asc(templates.category), asc(templates.position))
}

export async function findTemplateBySlug(slug: string, ownerId?: string) {
	const visibility = ownerId
		? or(isNull(templates.owner_id), eq(templates.owner_id, ownerId))
		: isNull(templates.owner_id)
	const [row] = await db
		.select()
		.from(templates)
		.where(and(eq(templates.slug, slug), visibility))
		.limit(1)
	return row ?? null
}

/**
 * Upsert template bawaan berdasarkan slug: definisi bawaan ditulis sebagai
 * kode dan disalin ke tabel saat boot. Baris milik pengguna (`owner_id` terisi)
 * tidak pernah disentuh di sini - slug-nya memang tidak bisa bertabrakan
 * karena constraint unik, tapi fungsi ini hanya dipanggil dengan slug bawaan.
 */
export async function upsertBuiltinTemplate(values: Omit<NewTemplate, 'builtin' | 'owner_id'>) {
	const [row] = await db
		.insert(templates)
		.values({ ...values, builtin: true, owner_id: null })
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
