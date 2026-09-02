import { describe, expect, test } from 'bun:test'
import { EDITOR_TOOLS } from '@writer-hub/shared'
import { BUILTIN_TEMPLATES } from './catalog'
import { compileTemplateContent } from './compile'

describe('katalog template bawaan', () => {
	test('setiap slug unik', () => {
		const slugs = BUILTIN_TEMPLATES.map((template) => template.slug)
		expect(new Set(slugs).size).toBe(slugs.length)
	})

	test('setiap struktur punya minimal satu bagian wajib', () => {
		for (const template of BUILTIN_TEMPLATES) {
			expect(
				template.spec.structure.some((item) => item.required),
				`${template.slug} tanpa bagian required`,
			).toBe(true)
		}
	})

	test('setiap template punya aturan AI dan deskripsi kartu', () => {
		for (const template of BUILTIN_TEMPLATES) {
			expect(template.spec.aiRules.length, `${template.slug} tanpa aiRules`).toBeGreaterThan(0)
			expect(template.description.length, `${template.slug} tanpa deskripsi`).toBeGreaterThan(0)
		}
	})

	test('kompilasi Markdown menghasilkan dokumen yang sah untuk seluruh katalog', () => {
		for (const template of BUILTIN_TEMPLATES) {
			const doc = compileTemplateContent(template)
			expect(doc.type).toBe('doc')
			expect(doc.content.length, `${template.slug} terkompilasi kosong`).toBeGreaterThan(0)
		}
	})

	test('template berkolom mendapat section break pembawa kolomnya', () => {
		const berkolom = BUILTIN_TEMPLATES.filter((template) => template.spec.layout.columns)
		expect(berkolom.length).toBeGreaterThan(0)
		for (const template of berkolom) {
			const doc = compileTemplateContent(template)
			const breaks = doc.content.filter((node) => node.type === 'sectionBreak')
			expect(breaks, `${template.slug} tanpa sectionBreak`).toHaveLength(1)
			expect(breaks[0].attrs?.columns).toEqual(template.spec.layout.columns)
		}
	})
})

describe('slug yang disebutkan ke model', () => {
	/*
	 * `apply_template_format` menyebut sejumlah slug sebagai contoh di deskripsi
	 * parameternya, dan itulah satu-satunya daftar yang pernah dilihat model.
	 * Slug yang salah ketik tidak akan pernah ketahuan saat kompilasi - ia
	 * muncul sebagai "Template tidak dikenal" di tengah percakapan penulis.
	 */
	test('setiap contoh slug di deskripsi alat benar-benar ada di katalog', () => {
		const tool = EDITOR_TOOLS.find((item) => item.name === 'apply_template_format')
		const template = tool?.parameters.properties.template as { description?: string } | undefined
		const description = template?.description ?? ''

		const mentioned = [...description.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1])
		expect(mentioned.length).toBeGreaterThan(5)

		const known = new Set(BUILTIN_TEMPLATES.map((template) => template.slug))
		for (const slug of mentioned) {
			expect(known.has(slug), `slug "${slug}" disebut ke model tapi tidak ada di katalog`).toBe(true)
		}
	})
})
