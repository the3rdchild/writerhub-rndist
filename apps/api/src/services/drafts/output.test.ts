import { describe, expect, test } from 'bun:test'
import { draftRequestSchema } from './dto'
import { outputsInPrompt, pendingRenderErrors, resolveOutputs } from './output'

describe('outputsInPrompt', () => {
	/*
	 * Kalimat yang melahirkan seluruh jalur ini, dari AI Chat PPE.
	 */
	test('membaca format dari kalimat penggunanya', () => {
		expect(outputsInPrompt('buatin saya pamflet jangan buang sampah, outputnya pdf')).toEqual(['pdf'])
	})

	test('ekstensi bertitik ikut terbaca', () => {
		expect(outputsInPrompt('buatkan famflet A dengan keluaran .pdf')).toEqual(['pdf'])
	})

	test('beberapa format sekaligus', () => {
		expect(outputsInPrompt('kirim pdf dan docx ya')).toEqual(['pdf', 'docx'])
	})

	test('jpeg dan jpg satu keluaran yang sama', () => {
		expect(outputsInPrompt('simpan sebagai jpeg')).toEqual(['jpg'])
		expect(outputsInPrompt('simpan sebagai jpg')).toEqual(['jpg'])
	})

	test('urutannya tetap, bukan urutan kemunculan di kalimat', () => {
		expect(outputsInPrompt('png dulu baru pdf')).toEqual(['pdf', 'png'])
	})

	/*
	 * Batas yang paling penting di berkas ini: menebak terlalu rajin berarti
	 * membelanjakan satu slot perender untuk berkas yang tidak diminta.
	 */
	test('permintaan tanpa format tidak merender apa pun', () => {
		expect(outputsInPrompt('buatkan flyer lomba 17 Agustus')).toEqual([])
	})

	test('"gambar" menyebut isi rancangan, bukan bentuk berkas', () => {
		expect(outputsInPrompt('buatkan flyer dengan gambar kucing')).toEqual([])
	})

	/*
	 * `\bword\b` sendirian akan kena di sini - dan panjang naskah justru hal
	 * yang memang sering ditulis di permintaan draf (`words` bahkan medan
	 * tersendiri di `dto.ts`).
	 */
	test('panjang naskah dalam "words" bukan permintaan DOCX', () => {
		expect(outputsInPrompt('tulis artikel 500 words tentang daur ulang')).toEqual([])
	})

	test('"word" dikenali kalau didahului kata yang menandai berkas', () => {
		expect(outputsInPrompt('outputnya file word ya')).toEqual(['docx'])
		expect(outputsInPrompt('kirim dalam format word')).toEqual(['docx'])
	})

	test('kata yang kebetulan memuat token tidak ikut', () => {
		expect(outputsInPrompt('artikel tentang keamanan password dan wordpress')).toEqual([])
	})

	test('tanpa prompt sama sekali', () => {
		expect(outputsInPrompt(undefined)).toEqual([])
	})
})

describe('resolveOutputs', () => {
	test('output eksplisit menang atas kalimatnya', () => {
		expect(resolveOutputs({ prompt: 'outputnya pdf', output: ['docx'] })).toEqual(['docx'])
	})

	/*
	 * PPE bisa memparafrase kalimat penggunanya dan menghilangkan kata
	 * formatnya. Larik kosong yang eksplisit karena itu harus berarti "jangan
	 * render apa pun", bukan "tebak sendiri".
	 */
	test('kalimatnya dibaca hanya kalau output tidak dinyatakan', () => {
		expect(resolveOutputs({ prompt: 'buatkan pamflet, outputnya pdf' })).toEqual(['pdf'])
	})

	test('tanpa keduanya, tidak ada yang dirender', () => {
		expect(resolveOutputs({ prompt: 'buatkan ringkasan rapat' })).toEqual([])
	})
})

describe('skema permintaan', () => {
	test('skalar diterima dan dinormalkan jadi larik', () => {
		const parsed = draftRequestSchema.safeParse({ prompt: 'x', output: 'pdf' })

		expect(parsed.success).toBe(true)
		expect(parsed.success && parsed.data.output).toEqual(['pdf'])
	})

	test('larik diterima apa adanya, tanpa duplikat', () => {
		const parsed = draftRequestSchema.safeParse({ prompt: 'x', output: ['pdf', 'png', 'pdf'] })

		expect(parsed.success && parsed.data.output).toEqual(['pdf', 'png'])
	})

	test('format yang tidak dikenal ditolak', () => {
		expect(draftRequestSchema.safeParse({ prompt: 'x', output: 'svg' }).success).toBe(false)
	})

	test('tanpa output, medannya memang tidak ada', () => {
		const parsed = draftRequestSchema.safeParse({ prompt: 'x' })

		expect(parsed.success && parsed.data.output).toBeUndefined()
	})
})

describe('pendingRenderErrors', () => {
	/*
	 * Bentuknya dikunci sebelum perendernya ada supaya PPE menuliskan
	 * penanganannya sekali saja: begitu naskahnya selesai, entri di sini
	 * berubah jadi entri di `downloads` tanpa PPE mengubah apa pun.
	 */
	test('tiap keluaran yang diminta mendapat alasannya sendiri', () => {
		const errors = pendingRenderErrors(['pdf', 'docx'])

		expect(errors.map((error) => error.output)).toEqual(['pdf', 'docx'])
		expect(errors[0].reason).toContain('naskahnya selesai')
	})

	test('tidak ada yang diminta, tidak ada yang dilaporkan', () => {
		expect(pendingRenderErrors([])).toEqual([])
	})
})
