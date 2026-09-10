import { describe, expect, test } from 'bun:test'
import {
	DARK_PALETTE,
	type DiagramPalette,
	isCompletePalette,
	LIGHT_PALETTE,
	reskinSvg,
} from './diagram-skin'

describe('perpindahan palet', () => {
	/*
	 * Yang menjatuhkan penggantian berurutan: terang dan gelap saling menukar
	 * dua nilai. Diganti satu per satu, penggantian kedua membalik hasil
	 * penggantian pertama dan seluruh diagram keluar dengan satu warna.
	 */
	test('nilai yang saling bertukar tidak saling menimpa', () => {
		const svg = '<rect fill="#f5f5f5" stroke="#2d3142"/>'
		expect(reskinSvg(svg, DARK_PALETTE)).toBe('<rect fill="#2d3142" stroke="#f5f5f5"/>')
	})

	test('seluruh peran ikut berpindah', () => {
		const svg = '#f5f5f5 #ececec #2d3142 #4f5d75 #7a8399 #eb6c36 #2e5aa8'
		expect(reskinSvg(svg, DARK_PALETTE)).toBe('#2d3142 #393e53 #f5f5f5 #bfc0c0 #8e98ac #f08a59 #6a95d8')
	})

	/*
	 * rgba(45,49,66,0.10) bukan warna lain melainkan ink pada opasitas. Kalau ia
	 * tertinggal, garis rambut di atas kertas gelap tetap digambar dengan tinta
	 * gelap - dan menghilang.
	 */
	test('bentuk rgba ikut, dengan opasitas yang sama', () => {
		expect(reskinSvg('stroke="rgba(45,49,66,0.12)"', DARK_PALETTE)).toBe('stroke="rgba(245,245,245,0.12)"')
		expect(reskinSvg('fill="rgba(235,108,54,0.08)"', DARK_PALETTE)).toBe('fill="rgba(240,138,89,0.08)"')
	})

	test('spasi di dalam rgba tidak menggagalkannya', () => {
		expect(reskinSvg('rgba( 45, 49, 66, 0.4)', DARK_PALETTE)).toBe('rgba(245,245,245, 0.4)')
	})

	test('huruf besar-kecil hex tidak menentukan', () => {
		expect(reskinSvg('fill="#EB6C36"', DARK_PALETTE)).toBe('fill="#f08a59"')
	})

	test('warna di luar palet dibiarkan - ia bukan token', () => {
		expect(reskinSvg('fill="#123456"', DARK_PALETTE)).toBe('fill="#123456"')
	})

	test('palet yang sama tidak mengubah apa pun', () => {
		const svg = '<rect fill="#f5f5f5" stroke="rgba(45,49,66,0.12)"/>'
		expect(reskinSvg(svg, LIGHT_PALETTE)).toBe(svg)
	})

	/*
	 * Bukan cuma terang dan gelap: pamflet berwarna merek menampung diagram yang
	 * harus ikut warnanya, dan itu palet sembarang.
	 */
	test('palet sembarang, bukan hanya gelap', () => {
		const brand: DiagramPalette = {
			paper: '#0b1f3a',
			paper2: '#12294a',
			ink: '#ffffff',
			muted: '#9fb3c8',
			soft: '#6b8299',
			accent: '#ffd166',
			link: '#5bc0eb',
		}
		expect(reskinSvg('<rect fill="#f5f5f5" stroke="#eb6c36"/>', brand)).toBe(
			'<rect fill="#0b1f3a" stroke="#ffd166"/>',
		)
	})

	/*
	 * Geometri tidak boleh tersentuh sama sekali - itu seluruh alasan
	 * substitusi ini dipilih daripada menggambar ulang.
	 */
	test('koordinat dan teks tidak tersentuh', () => {
		const svg = '<rect x="45" y="49" width="66" height="235" fill="#f5f5f5"/><text>45,49,66</text>'
		expect(reskinSvg(svg, DARK_PALETTE)).toBe(
			'<rect x="45" y="49" width="66" height="235" fill="#2d3142"/><text>45,49,66</text>',
		)
	})
})

describe('palet yang tidak lengkap', () => {
	/*
	 * Diagram yang kertasnya ikut rancangan tapi tintanya tidak akan keluar
	 * sebagai teks gelap di atas kertas gelap - tak terbaca, dan tidak jelas apa
	 * yang salah. Palet bawaan yang utuh lebih baik.
	 */
	test('kurang satu peran berarti ditolak seluruhnya', () => {
		const { link: _link, ...incomplete } = DARK_PALETTE
		expect(isCompletePalette(incomplete)).toBe(false)
	})

	test('nilai yang bukan hex enam digit ditolak', () => {
		expect(isCompletePalette({ ...DARK_PALETTE, accent: 'coral' })).toBe(false)
		expect(isCompletePalette({ ...DARK_PALETTE, accent: '#fff' })).toBe(false)
	})

	test('palet utuh diterima', () => {
		expect(isCompletePalette(DARK_PALETTE)).toBe(true)
	})
})
