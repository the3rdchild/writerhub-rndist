import { describe, expect, test } from 'bun:test'
import type { TemplateSpec } from '@writer-hub/shared'
import { BUILTIN_TEMPLATES } from './catalog'
import { templateDocumentLayout, templateTabLayout } from './layout'

const pageSetup: TemplateSpec['layout']['pageSetup'] = {
	size: 'a4',
	orientation: 'portrait',
	margins: { top: 96, right: 96, bottom: 96, left: 96 },
	pageColor: null,
	pageless: false,
}

const furniture = { header: { default: { text: 'JUDUL PENDEK', align: 'left' as const } } }

function spec(layout: Partial<TemplateSpec['layout']> = {}): TemplateSpec {
	return {
		layout: { pageSetup, ...layout },
		format: { citationStyle: 'none', headingScheme: 'plain', language: 'id' },
		structure: [{ heading: 'Isi', level: 1, required: true }],
		aiRules: ['Write in Indonesian.'],
	}
}

describe('tata letak dokumen', () => {
	test('membawa geometri halaman', () => {
		expect(templateDocumentLayout(spec())).toEqual({ pageSetup })
	})

	// Perabot tingkat dokumen tidak punya pembaca di sisi editor; menyimpannya
	// di sana hanya membuat basis data terlihat benar sementara headernya
	// tidak pernah muncul.
	test('tidak membawa perabot halaman', () => {
		expect(templateDocumentLayout(spec({ furniture }))).toEqual({ pageSetup })
	})
})

describe('tata letak tab', () => {
	test('perabot halaman turun ke tab', () => {
		expect(templateTabLayout(spec({ furniture }))).toEqual({ furniture })
	})

	test('template tanpa perabot tidak meninggalkan penimpa kosong', () => {
		expect(templateTabLayout(spec())).toBeNull()
	})
})

describe('katalog bawaan', () => {
	test('setiap template berperabot menghasilkan penimpa tab', () => {
		const berperabot = BUILTIN_TEMPLATES.filter((template) => template.spec.layout.furniture)
		expect(berperabot.length).toBeGreaterThan(0)

		for (const template of berperabot) {
			expect(templateTabLayout(template.spec), `${template.slug} tanpa penimpa tab`).not.toBeNull()
		}
	})
})
