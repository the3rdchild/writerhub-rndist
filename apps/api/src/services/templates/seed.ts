import LoggerClient from '@/lib/logger'
import { upsertBuiltinTemplate } from '@/repository/template'
import { BUILTIN_TEMPLATES } from './catalog'
import { compileTemplateContent } from './compile'

/**
 * Menyalin definisi bawaan dari kode ke tabel `templates` saat boot. Idempoten
 * karena upsert berpatokan slug; template milik pengguna tidak disentuh.
 */
export async function seedBuiltinTemplates(): Promise<number> {
	let seeded = 0
	for (const definition of BUILTIN_TEMPLATES) {
		const row = await upsertBuiltinTemplate({
			slug: definition.slug,
			name: definition.name,
			description: definition.description,
			category: definition.category,
			locale: definition.locale,
			position: definition.position,
			spec: definition.spec,
			content: compileTemplateContent(definition),
		})
		if (row) seeded += 1
	}
	return seeded
}

/** Dipakai bootstrap: kegagalan seed tidak boleh mematikan API. */
export async function seedBuiltinTemplatesSafely(): Promise<void> {
	try {
		const count = await seedBuiltinTemplates()
		console.log(`- Templates: ${count} template bawaan tersedia`)
	} catch (error) {
		LoggerClient.getInstance().error({ err: error }, 'Gagal men-seed template bawaan')
	}
}
