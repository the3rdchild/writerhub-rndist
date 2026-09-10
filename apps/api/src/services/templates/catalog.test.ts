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

/*
 * Metadata mengganti teks contoh dengan pencocokan LITERAL. Kalau teks yang
 * dijanjikan `metadataFields` tidak ada di kerangkanya, isian itu diam-diam
 * tidak melakukan apa pun; kalau ia muncul lebih dari sekali, mengisinya juga
 * menimpa tempat lain yang tidak dimaksud. Keduanya gagal tanpa pesan, jadi
 * katalognya yang dijaga di sini - bukan pemakainya.
 */
describe('isian metadata template', () => {
	const textsOf = (node: unknown, out: string[] = []): string[] => {
		if (Array.isArray(node)) {
			for (const child of node) textsOf(child, out)
			return out
		}
		if (!node || typeof node !== 'object') return out
		const record = node as Record<string, unknown>
		if (typeof record.text === 'string') out.push(record.text)
		for (const value of Object.values(record)) textsOf(value, out)
		return out
	}

	const withFields = BUILTIN_TEMPLATES.filter((template) => template.spec.metadataFields?.length)

	test('minimal satu template menawarkannya', () => {
		expect(withFields.length).toBeGreaterThan(0)
	})

	test('kuncinya unik di dalam satu template', () => {
		for (const template of withFields) {
			const keys = (template.spec.metadataFields ?? []).map((field) => field.key)
			expect(new Set(keys).size, `${template.slug} punya kunci metadata kembar`).toBe(keys.length)
		}
	})

	test('tiap teks contoh muncul TEPAT SEKALI di kerangkanya', () => {
		for (const template of withFields) {
			const body = textsOf(compileTemplateContent(template)).join('\n')
			for (const field of template.spec.metadataFields ?? []) {
				if (!field.placeholder) continue
				const hits = body.split(field.placeholder).length - 1
				expect(hits, `${template.slug}: teks contoh "${field.placeholder}" muncul ${hits}x`).toBe(1)
			}
		}
	})

	test('isian tanpa teks contoh tetap punya label - ia muncul di formulir', () => {
		for (const template of withFields) {
			for (const field of template.spec.metadataFields ?? []) {
				expect(field.label.length, `${template.slug}: isian ${field.key} tanpa label`).toBeGreaterThan(0)
			}
		}
	})
})
