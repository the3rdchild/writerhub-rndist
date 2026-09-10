import { describe, expect, test } from 'bun:test'
import { MIN_CONTENT_WIDTH, type PageMargins } from '@/features/editor/page-geometry'
import { rulerMarginPatch } from './document-ruler'

/** Letter potret: 816px lebar, margin satu inci di keempat sisi. */
const WIDTH = 816
const margins: PageMargins = { top: 96, right: 96, bottom: 96, left: 96 }

describe('rulerMarginPatch', () => {
	test('margin kiri mengikuti posisi gagangnya apa adanya', () => {
		expect(rulerMarginPatch('marginLeft', 150, WIDTH, margins)).toEqual({ left: 150 })
	})

	test('margin kanan diukur dari tepi kanan kertas, bukan dari kiri', () => {
		expect(rulerMarginPatch('marginRight', 700, WIDTH, margins)).toEqual({ right: WIDTH - 700 })
	})

	test('tidak pernah menembus tepi kertas', () => {
		expect(rulerMarginPatch('marginLeft', -80, WIDTH, margins)).toEqual({ left: 0 })
		expect(rulerMarginPatch('marginRight', WIDTH + 80, WIDTH, margins)).toEqual({ right: 0 })
	})

	test('menyisakan ruang tulis minimum - margin tidak bisa menelan lawannya', () => {
		const left = rulerMarginPatch('marginLeft', WIDTH, WIDTH, margins)
		expect(left).toEqual({ left: WIDTH - margins.right - MIN_CONTENT_WIDTH })

		const right = rulerMarginPatch('marginRight', 0, WIDTH, margins)
		expect(right).toEqual({ right: WIDTH - margins.left - MIN_CONTENT_WIDTH })
	})

	test('batasnya ikut margin seberang yang sedang berlaku', () => {
		const wideRight: PageMargins = { ...margins, right: 300 }
		expect(rulerMarginPatch('marginLeft', WIDTH, WIDTH, wideRight)).toEqual({
			left: WIDTH - 300 - MIN_CONTENT_WIDTH,
		})
	})

	test('gagang selain margin bukan urusannya', () => {
		expect(rulerMarginPatch('indentLeft', 200, WIDTH, margins)).toBeNull()
		expect(rulerMarginPatch('tableCol', 200, WIDTH, margins)).toBeNull()
		expect(rulerMarginPatch('imageX', 200, WIDTH, margins)).toBeNull()
	})
})
