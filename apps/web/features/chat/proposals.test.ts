import { describe, expect, test } from 'bun:test'
import { extractProposals, stripProposals } from './chat-context'

/**
 * Bagian mana dari jawaban AI yang layak diberi tombol Apply.
 *
 * Kasus yang memicu berkas ini: model menjawab "buatkan tabel" dengan tabel
 * pipe di tengah prosa, bukan di dalam pagar - jadi tidak ada satu pun tombol
 * untuk memasukkannya ke dokumen.
 */

const WITH_TABLE = `Baik, berikut contoh tabel yang bisa langsung disalin ke dokumen Anda:

| No | Nama | Jabatan |
|----|------|---------|
| 1 | Andi Pratama | Manajer |
| 2 | Siti Rahma | Supervisor |

Semoga membantu.`

describe('tabel di dalam prosa', () => {
	test('dikenali sebagai usulan', () => {
		const proposals = extractProposals(WITH_TABLE)
		expect(proposals).toHaveLength(1)
		expect(proposals[0]).toContain('Andi Pratama')
	})

	test('dikeluarkan dari prosa supaya tidak tampil dua kali', () => {
		const prose = stripProposals(WITH_TABLE)
		expect(prose).not.toContain('Andi Pratama')
		expect(prose).toContain('Semoga membantu.')
	})
})

describe('blok berpagar', () => {
	test('tetap jadi usulan seperti sebelumnya', () => {
		const content = 'Coba ini:\n\n```\nKalimat pengganti.\n```\n\nSelesai.'
		expect(extractProposals(content)).toEqual(['Kalimat pengganti.'])
		expect(stripProposals(content)).toBe('Coba ini:\n\nSelesai.')
	})

	test('tabel di dalam pagar tidak dihitung dua kali', () => {
		const content = '```\n| a | b |\n|---|---|\n| 1 | 2 |\n```'
		expect(extractProposals(content)).toHaveLength(1)
	})
})

describe('jawaban biasa', () => {
	test('tanpa usulan, tidak ada kartu', () => {
		const content = 'Kalimat itu sudah jelas dan tidak perlu diubah.'
		expect(extractProposals(content)).toEqual([])
		expect(stripProposals(content)).toBe(content)
	})

	test('garis tegak tanpa baris pemisah bukan tabel', () => {
		expect(extractProposals('Pilih a | b | c sesuai kebutuhan.')).toEqual([])
	})
})
