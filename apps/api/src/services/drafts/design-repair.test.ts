import { describe, expect, test } from 'bun:test'
import { repairDesignHtml } from './design-repair'

/** A4 potret, kanvas yang kami sebutkan sendiri di prompt. */
const A4 = { width: 794, height: 1123 }

describe('repairDesignHtml', () => {
	/*
	 * Bentuk yang benar-benar dihasilkan model, disalin dari flyer yang gagal:
	 * body dijadikan viewport gelap yang menengahkan "kertas" berukuran tetap
	 * di dalamnya. Hasilnya rancangan melayang dengan margin mati.
	 */
	const FAILED = [
		'<style>',
		'body { background:#1a2e1a; display:flex; align-items:center; min-height:100vh }',
		'.flayer { width: 794px; height: 1123px; padding: 40px 48px }',
		'</style>',
		'<div class="flayer">isi</div>',
	].join('\n')

	test('ukuran tetap sebesar kertas kembali jadi 100%', () => {
		const { html, repaired } = repairDesignHtml(FAILED, A4)

		expect(html).toContain('width: 100%')
		expect(html).toContain('height: 100%')
		expect(html).not.toContain('794px')
		expect(html).not.toContain('1123px')
		expect(repaired).toHaveLength(3)
	})

	/*
	 * Anak yang tingginya penuh tidak menyisakan apa pun untuk ditengahkan, dan
	 * menutup habis latar gelap di belakangnya - jadi idiom "meja dan kertas"
	 * lumpuh tanpa satu pun aturan body disentuh.
	 */
	test('aturan body dibiarkan utuh - ia tidak perlu disentuh', () => {
		const { html } = repairDesignHtml(FAILED, A4)

		expect(html).toContain('background:#1a2e1a')
		expect(html).toContain('align-items:center')
	})

	test('satuan viewport penuh menjadi persen', () => {
		const { html, repaired } = repairDesignHtml('<div style="min-height:100vh"></div>', A4)

		expect(html).toContain('min-height:100%')
		expect(repaired[0]).toContain('viewport')
	})

	/*
	 * Batas yang menjaga perbaikan ini tetap aman: hanya angka yang PERSIS
	 * sebesar lembarnya yang disentuh. Ukuran tetap lain adalah keputusan
	 * rancangan, bukan salah paham soal kertas.
	 */
	test('ukuran tetap lain tidak disentuh', () => {
		const source = '<div style="width: 320px; height: 240px"></div>'

		expect(repairDesignHtml(source, A4).html).toBe(source)
		expect(repairDesignHtml(source, A4).repaired).toEqual([])
	})

	test('nilai vh selain penuh dibiarkan', () => {
		const source = '<div style="height:50vh"></div>'

		expect(repairDesignHtml(source, A4).html).toBe(source)
	})

	test('lanskap memakai angkanya sendiri', () => {
		const landscape = { width: 1123, height: 794 }
		const { html } = repairDesignHtml('<div style="width:1123px;height:794px"></div>', landscape)

		expect(html).toBe('<div style="width:100%;height:100%"></div>')
	})

	test('rancangan yang sudah benar tidak diubah sama sekali', () => {
		const source = '<div style="width:100%;height:100%">isi</div>'

		expect(repairDesignHtml(source, A4).html).toBe(source)
		expect(repairDesignHtml(source, A4).repaired).toEqual([])
	})

	/*
	 * Regex ber-flag /g mengingat posisi terakhirnya. Tanpa reset, pemanggilan
	 * kedua melewatkan awal berkas - dan jalur ini dipanggil sekali per draf.
	 */
	test('pemanggilan berulang memberi hasil yang sama', () => {
		const first = repairDesignHtml(FAILED, A4)
		const second = repairDesignHtml(FAILED, A4)

		expect(second.html).toBe(first.html)
		expect(second.repaired).toEqual(first.repaired)
	})
})
