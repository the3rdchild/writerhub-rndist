import { describe, expect, test } from 'bun:test'
import { detectLanguage, LANGUAGE_OPTIONS, requiresAiTier } from './language'
const INDONESIAN = `
Fitur ini bertujuan untuk memberikan fleksibilitas pada pengguna yang ingin
membuat slide dari template manual atau dari hasil AI. Sistem akan menyediakan
galeri template yang bisa diaplikasikan ke deck, dan pengguna juga dapat
mengedit isinya tanpa melewati pipeline AI.
`

const ENGLISH = `
This document describes the product requirements for the slide generation
feature. The system is expected to provide a gallery of templates that can be
applied to a deck, and it should also allow the user to edit the content
without going through the AI pipeline.
`

describe('memisahkan Inggris dari bukan-Inggris', () => {
	test('naskah Indonesia terbaca sebagai id', () => {
		const result = detectLanguage(INDONESIAN)
		expect(result.code).toBe('id')
		expect(result.confident).toBe(true)
	})

	test('naskah Inggris terbaca sebagai en', () => {
		const result = detectLanguage(ENGLISH)
		expect(result.code).toBe('en')
		expect(result.confident).toBe(true)
	})
})

describe('aksara non-Latin menentukan bahasanya sendiri', () => {
	test('kana Jepang', () => {
		expect(detectLanguage('これはテストです。文章を確認してください。').code).toBe('ja')
	})

	test('Hangul diperiksa sebelum Han, jadi Korea tidak terbaca sebagai Cina', () => {
		expect(detectLanguage('이 문서는 제품 요구 사항을 설명합니다.').code).toBe('ko')
	})

	test('Arab', () => {
		expect(detectLanguage('هذا المستند يصف متطلبات المنتج.').code).toBe('ar')
	})
})

describe('naskah yang buktinya tipis', () => {
	test('teks pendek tidak diklaim meyakinkan', () => {
		const result = detectLanguage('Halo dunia')
		expect(result.confident).toBe(false)
	})

	test('dokumen kosong jatuh ke bawaan, bukan melempar', () => {
		expect(detectLanguage('').confident).toBe(false)
	})
})

describe('tier non-AI', () => {
	test('hanya bahasa Inggris yang boleh lewat standard/advanced', () => {
		expect(requiresAiTier('en')).toBe(false)
		expect(requiresAiTier('id')).toBe(true)
		expect(requiresAiTier('ja')).toBe(true)
	})
})
describe('bendera bahasa (§P1, B-5)', () => {
        test('setiap pilihan punya kode bendera dua huruf', () => {
                for (const option of LANGUAGE_OPTIONS) {
                        expect(option.flag).toMatch(/^[a-z]{2}$/)
                }
        })

        test('pemetaan bahasa→bendera sesuai keputusan §15.2', () => {
                const byCode = new Map(LANGUAGE_OPTIONS.map((o) => [o.code, o.flag]))
                expect(byCode.get('en')).toBe('us')
                expect(byCode.get('id')).toBe('id')
                expect(byCode.get('pt')).toBe('br')
                expect(byCode.get('ar')).toBe('sa')
                expect(byCode.get('ja')).toBe('jp')
        })
})