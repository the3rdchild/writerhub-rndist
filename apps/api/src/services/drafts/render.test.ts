import { describe, expect, test } from 'bun:test'
import { downloadFileName, unrenderedReason } from './output'
import { renderErrorsOf } from './render'
import type { RenderRecord } from './render-store'

/*
 * Yang diuji di sini bagian murninya saja: menyusun `renderErrors` dari catatan
 * render dan menamai berkas unduhan. Bagian yang menitipkan job dan menerbitkan
 * URL memegang antrean, Redis, dan S3 - bukan barangnya uji satuan.
 */

describe('renderErrorsOf', () => {
	test('keluaran yang sudah ada tidak diulang sebagai galat', () => {
		const record: RenderRecord = {
			status: 'done',
			downloads: [{ output: 'pdf', key: 'exports/x.pdf' }],
			errors: [],
		}

		expect(renderErrorsOf(record, ['pdf'])).toEqual([])
	})

	test('alasan yang tercatat menang atas yang generik', () => {
		const record: RenderRecord = {
			status: 'done',
			downloads: [],
			errors: [{ output: 'pdf', reason: 'Dokumennya 94 halaman, melebihi batas render (50).' }],
		}

		const errors = renderErrorsOf(record, ['pdf'])
		expect(errors).toEqual([{ output: 'pdf', reason: 'Dokumennya 94 halaman, melebihi batas render (50).' }])
	})

	test('format tanpa perender tetap dijawab, bukan didiamkan', () => {
		const record: RenderRecord = {
			status: 'done',
			downloads: [{ output: 'pdf', key: 'exports/x.pdf' }],
			errors: [],
		}

		const errors = renderErrorsOf(record, ['pdf', 'png'])
		expect(errors.map((error) => error.output)).toEqual(['png'])
		expect(errors[0].reason).toContain('belum tersedia')
	})
})

describe('downloadFileName', () => {
	test('karakakter yang bermakna di path dibuang, sisanya dipertahankan', () => {
		expect(downloadFileName('Pamflet Edukasi: Kebakaran Hutan', 'pdf')).toBe(
			'Pamflet Edukasi Kebakaran Hutan.pdf',
		)
		expect(downloadFileName('a/b\\c:d*e?f"g<h>i|j', 'pdf')).toBe('abcdefghij.pdf')
	})

	test('judul kosong atau yang habis tersaring tetap punya nama', () => {
		expect(downloadFileName('   ', 'pdf')).toBe('dokumen.pdf')
		expect(downloadFileName('???', 'pdf')).toBe('dokumen.pdf')
	})

	test('judul panjang dipotong tanpa spasi menggantung', () => {
		const name = downloadFileName(`${'kata '.repeat(40)}ujung`, 'pdf')
		expect(name.endsWith('.pdf')).toBe(true)
		expect(name.slice(0, -4).endsWith(' ')).toBe(false)
		expect(name.length).toBeLessThanOrEqual(104)
	})
})

describe('unrenderedReason', () => {
	test('format yang perendernya belum ditulis menyebut formatnya', () => {
		expect(unrenderedReason('docx')).toContain('DOCX')
		expect(unrenderedReason('docx')).toContain('belum tersedia')
	})

	test('format yang perendernya ada tapi hasilnya tak terlacak, diajak mencoba ulang', () => {
		expect(unrenderedReason('pdf')).toContain('minta ulang')
	})
})
