import { describe, expect, test } from 'bun:test'
import { EMBEDDABLE_FONTS, embeddableFont, fontChoicePrompt } from '@writer-hub/shared'
import { FONT_FAMILIES } from './font-catalog'
import { fontsUsedIn } from './font-embed'

describe('fontsUsedIn', () => {
	test('memungut keluarga dari deklarasi font-family', () => {
		const used = fontsUsedIn(`<div style="font-family: 'Playfair Display', serif">Undangan</div>`)

		expect(used.map((font) => font.family)).toEqual(['Playfair Display'])
	})

	test('tidak peka huruf besar-kecil', () => {
		expect(fontsUsedIn('<style>h1{font-family:montserrat,sans-serif}</style>')).toHaveLength(1)
	})

	/*
	 * Alasan berkas ini mencari di dalam deklarasi `font-family`, bukan di
	 * seluruh teks: nama keluarga font juga nama orang, kota, dan merek. Menyeret
	 * satu woff2 ke dalam bingkai setiap kali flyer menyebut "Lora" adalah
	 * pemborosan yang tidak pernah terlihat sebagai bug.
	 */
	test('nama yang cuma muncul di naskah tidak ikut', () => {
		expect(fontsUsedIn('<p>Panitia: Lora dan Caveat</p>')).toEqual([])
	})

	test('keluarga yang tidak tersedia diabaikan', () => {
		expect(fontsUsedIn('<div style="font-family: Comic Sans MS">x</div>')).toEqual([])
	})

	test('beberapa keluarga sekaligus', () => {
		const used = fontsUsedIn('<style>h1{font-family:Oswald}p{font-family:"Open Sans",sans-serif}</style>')

		expect(used.map((font) => font.family).sort()).toEqual(['Open Sans', 'Oswald'])
	})
})

describe('katalog font', () => {
	/*
	 * Dua daftar, dua aplikasi: pemilih di toolbar (`font-catalog.ts`, hanya
	 * `apps/web`) dan daftar yang bisa disematkan (`packages/shared`, dibaca juga
	 * oleh prompt di `apps/api`). Kalau keduanya menyimpang, prompt akan
	 * menawarkan font yang tidak punya penyemat - dan kegagalannya cuma terlihat
	 * sebagai rancangan yang fontnya diam-diam berbeda dari yang diminta.
	 */
	test('tiap webfont di pemilih toolbar bisa disematkan', () => {
		const webfonts = FONT_FAMILIES.filter((font) => font.value.startsWith('var('))
		const hilang = webfonts.filter((font) => !embeddableFont(font.label))

		expect(hilang.map((font) => font.label)).toEqual([])
	})

	test('tiap wajah menunjuk berkas woff2 yang bernama', () => {
		for (const font of EMBEDDABLE_FONTS) {
			expect(font.faces.length).toBeGreaterThan(0)
			for (const face of font.faces) {
				expect(face.file).toMatch(/^[a-z0-9-]+\.woff2$/)
				expect(face.file.startsWith(`${font.slug}-`)).toBe(true)
			}
		}
	})

	test('prompt menyebut keluarga yang benar-benar ada beserta nadanya', () => {
		const prompt = fontChoicePrompt()

		expect(prompt).toContain('Playfair Display')
		expect(prompt).toContain('playful: ')
		expect(embeddableFont('playfair display')).toBeDefined()
	})
})
