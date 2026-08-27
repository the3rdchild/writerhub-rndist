import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const canvas = readFileSync(new URL('../../components/editor/document-canvas.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

describe('document-print-root (E1)', () => {
	test('kanvas menandai bingkai zoom-nya document-print-root', () => {
		expect(canvas).toContain('document-print-root')
	})

	test('CSS cetak menyatakan yang boleh dicetak secara positif', () => {
		expect(css).toContain('body *:has(.document-print-root)')
		expect(css).toContain(':not(.document-print-root *)')
	})

	test('selektor chrome lama tidak hidup berdampingan dengan yang baru', () => {
		expect(css).not.toContain('.document-canvas ~ *')
	})
})
