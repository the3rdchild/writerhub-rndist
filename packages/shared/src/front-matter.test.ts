import { describe, expect, test } from 'bun:test'
import { FRONT_MATTER, type FrontMatterNode, frontMatterNodes, teamMembers, workKindOf } from './front-matter'

const text = (node: FrontMatterNode): string =>
	node.text ??
	(node.content ?? []).map(text).join(node.type === 'tableRow' ? ' | ' : node.type === 'table' ? '\n' : '')
const lines = (nodes: FrontMatterNode[]) => nodes.map(text)

describe('sampul', () => {
	test('kerangka kosong memakai teks contoh berkurung, baris kampus kapital', () => {
		const cover = lines(frontMatterNodes('cover', FRONT_MATTER.skripsi))
		expect(cover[0]).toBe('SKRIPSI')
		expect(cover).toContain('[Judul]')
		expect(cover).toContain('[NAMA PENYUSUN]')
		expect(cover).toContain('PROGRAM STUDI [PROGRAM STUDI]')
		expect(cover).toContain('[UNIVERSITAS]')
		expect(cover.at(-1)).toBe('[Tahun]')
	})

	test('terisi dari metadata; tabel anggota hanya bila ada anggota', () => {
		const values = { judul: 'Pemetaan Sawit', nama: 'Budi Santoso', nim: '2201', prodi: 'Teknik Elektro' }
		const solo = frontMatterNodes('cover', FRONT_MATTER.skripsi, values)
		expect(lines(solo)).toContain('BUDI SANTOSO')
		expect(lines(solo)).toContain('PROGRAM STUDI TEKNIK ELEKTRO')
		expect(solo.some((node) => node.type === 'table')).toBe(false)

		const team = frontMatterNodes('cover', FRONT_MATTER.skripsi, {
			...values,
			anggota: 'Budi Santoso - 2201\nSiti - 2202',
		})
		const table = team.find((node) => node.type === 'table')
		expect(table?.attrs).toEqual({ borderStyle: 'none' })
		expect(text(table as FrontMatterNode)).toBe('Nama | NIM\nBudi Santoso | 2201\nSiti | 2202')
	})

	test('keterangan mengikuti jenis karya', () => {
		expect(lines(frontMatterNodes('cover', FRONT_MATTER.tesis))[0]).toBe('TESIS')
		expect(lines(frontMatterNodes('cover', FRONT_MATTER.tesis, { prodi: 'Fisika' })).join(' ')).toContain(
			'gelar Magister pada Program Studi Fisika',
		)
	})
})

describe('halaman pengesahan', () => {
	test('dua pembimbing berdampingan di tabel polos, lalu ketua program studi', () => {
		const approval = frontMatterNodes('approval', FRONT_MATTER.skripsi, {
			pembimbing1: 'Dr. A',
			nipPembimbing1: '111',
			kota: 'Bandung',
			tanggal: '30 April 2026',
		})
		const all = lines(approval)
		expect(all[0]).toBe('HALAMAN PENGESAHAN')
		expect(all).toContain('Bandung, 30 April 2026')
		const signatures = approval.find((node) => node.type === 'table')
		expect(signatures?.attrs).toEqual({ borderStyle: 'none' })
		expect(text(signatures as FrontMatterNode)).toBe(
			'Pembimbing Utama,Dr. ANIP. 111 | Co-Pembimbing,[Nama Co-Pembimbing]NIP. [NIP Co-Pembimbing]',
		)
		expect(all.slice(-2)).toEqual(['[Nama Ketua Program Studi]', 'NIP. [NIP Ketua Program Studi]'])
	})
})

test('anggota tim dan jenis karya dibaca longgar', () => {
	expect(teamMembers('Budi - 2201\n\n  Siti, 2202 ')).toEqual([
		{ name: 'Budi', id: '2201' },
		{ name: 'Siti', id: '2202' },
	])
	expect(workKindOf('Proposal penelitian')).toBe('proposal')
	expect(workKindOf('Makalah')).toBeNull()
})
