/**
 * Halaman sampul dan halaman pengesahan karya akademik - masing-masing satu
 * halaman, bentuknya tetap.
 *
 * Dulu sampul template hanyalah "# Judul Skripsi" dan tiga baris teks, dan
 * dokumen yang dimulai dari chat tidak punya sampul sama sekali: AI
 * merancangnya sendiri sebagai blok HTML, berbeda di setiap percakapan. Kini
 * keduanya dibangun di satu tempat ini - dipakai kompilasi template di server
 * dan alat `insert_template_part` di editor - mengikuti format proposal TA
 * yang dipakai pengguna, tanpa logo dan tanpa nama kampus tertentu.
 *
 * Keluarannya node ProseMirror biasa (paragraf rata tengah, teks tebal, tabel
 * tanpa garis), bukan blok HTML: bisa disunting, dan tetap teks di DOCX.
 */

import type { TemplateMetadataField } from './template'

export type FrontMatterPart = 'cover' | 'approval'

/**
 * Isian yang membedakan jenis karya. Teks contoh berkurung (`[Program Studi]`)
 * di dalam kalimatnya diganti nilai metadata saat dokumen dibuat.
 */
export interface FrontMatterSpec {
	/** "SKRIPSI", "TESIS" - baris pertama sampul dan halaman pengesahan. */
	label: string
	/** Kalimat keterangan di bawah judul sampul. */
	purpose: string
	/** Kalimat persetujuan di halaman pengesahan. */
	approval: string
}

export type WorkKind = 'skripsi' | 'tesis' | 'disertasi' | 'proposal'

export const FRONT_MATTER: Record<WorkKind, FrontMatterSpec> = {
	skripsi: {
		label: 'SKRIPSI',
		purpose:
			'Diajukan untuk memenuhi salah satu syarat memperoleh gelar Sarjana pada Program Studi [Program Studi] Fakultas [Fakultas] [Universitas]',
		approval:
			'Skripsi ini telah diperiksa dan disetujui sebagai salah satu syarat memperoleh gelar Sarjana pada Program Studi [Program Studi] Fakultas [Fakultas] [Universitas].',
	},
	tesis: {
		label: 'TESIS',
		purpose:
			'Diajukan untuk memenuhi salah satu syarat memperoleh gelar Magister pada Program Studi [Program Studi] Program Pascasarjana [Universitas]',
		approval:
			'Tesis ini telah diperiksa dan disetujui sebagai salah satu syarat memperoleh gelar Magister pada Program Studi [Program Studi] Program Pascasarjana [Universitas].',
	},
	disertasi: {
		label: 'DISERTASI',
		purpose:
			'Diajukan untuk memenuhi salah satu syarat memperoleh gelar Doktor pada Program Studi [Program Studi] Program Pascasarjana [Universitas]',
		approval:
			'Disertasi ini telah diperiksa dan disetujui sebagai salah satu syarat memperoleh gelar Doktor pada Program Studi [Program Studi] Program Pascasarjana [Universitas].',
	},
	proposal: {
		label: 'PROPOSAL PENELITIAN',
		purpose:
			'Disusun sebagai salah satu tahapan penyusunan tugas akhir pada Program Studi [Program Studi] Fakultas [Fakultas] [Universitas]',
		approval:
			'Proposal penelitian ini telah diperiksa dan disetujui sebagai salah satu tahapan penyusunan tugas akhir pada Program Studi [Program Studi] Fakultas [Fakultas] [Universitas].',
	},
}

/** Jenis karya dari isian brief ("Skripsi", "Proposal penelitian"). */
export function workKindOf(value: string | undefined): WorkKind | null {
	const text = value?.toLowerCase() ?? ''
	if (text.startsWith('skripsi')) return 'skripsi'
	if (text.startsWith('tesis')) return 'tesis'
	if (text.startsWith('disertasi')) return 'disertasi'
	if (text.startsWith('proposal')) return 'proposal'
	return null
}

/**
 * Isian identitas yang mengisi sampul dan halaman pengesahan. Nama dan NIP
 * orang ditandai pribadi: mengisi kertas, tidak pernah dikirim ke AI.
 */
export function frontMatterFields(titleLabel: string): TemplateMetadataField[] {
	return [
		{
			key: 'judul',
			label: titleLabel,
			placeholder: '[Judul]',
			briefKey: 'judul',
			example: 'Rancang Bangun Sistem Prediksi Kualitas Uap Panas Bumi',
		},
		{ key: 'nama', label: 'Nama penyusun', placeholder: '[Nama Penyusun]', personal: true },
		{ key: 'nim', label: 'NIM / NPM', placeholder: '[NIM]', personal: true },
		{
			key: 'anggota',
			label: 'Anggota tim',
			kind: 'multiline',
			personal: true,
			hint: 'Kosongkan untuk karya perorangan. Satu anggota per baris: Nama - NIM. Tabelnya dibuat saat sampul disisipkan lewat AI.',
		},
		{ key: 'prodi', label: 'Program studi', placeholder: '[Program Studi]' },
		{ key: 'fakultas', label: 'Fakultas', placeholder: '[Fakultas]' },
		{ key: 'universitas', label: 'Universitas', placeholder: '[Universitas]' },
		{ key: 'kota', label: 'Kota pengesahan', placeholder: '[Kota]' },
		{ key: 'tanggal', label: 'Tanggal pengesahan', placeholder: '[Tanggal]', example: '30 April 2026' },
		{ key: 'tahun', label: 'Tahun', placeholder: '[Tahun]', example: '2026' },
		{ key: 'pembimbing1', label: 'Pembimbing utama', placeholder: '[Nama Pembimbing Utama]', personal: true },
		{
			key: 'nipPembimbing1',
			label: 'NIP pembimbing utama',
			placeholder: '[NIP Pembimbing Utama]',
			personal: true,
		},
		{ key: 'pembimbing2', label: 'Co-pembimbing', placeholder: '[Nama Co-Pembimbing]', personal: true },
		{ key: 'nipPembimbing2', label: 'NIP co-pembimbing', placeholder: '[NIP Co-Pembimbing]', personal: true },
		{
			key: 'kaprodi',
			label: 'Ketua program studi',
			placeholder: '[Nama Ketua Program Studi]',
			personal: true,
		},
		{
			key: 'nipKaprodi',
			label: 'NIP ketua program studi',
			placeholder: '[NIP Ketua Program Studi]',
			personal: true,
		},
	]
}

export interface FrontMatterNode {
	type: string
	attrs?: Record<string, unknown>
	content?: FrontMatterNode[]
	text?: string
	marks?: { type: string }[]
}

/** Anggota tim dari isian "Nama - NIM" per baris. */
export function teamMembers(value: string | undefined): { name: string; id: string }[] {
	return (value ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [name, ...rest] = line.split(/\s*[,|\t]\s*|\s+[-–]\s+/)
			return { name: name.trim(), id: rest.join(' ').trim() }
		})
}

/*
 * Halaman pengesahan berspasi tunggal tanpa jarak antarparagraf, seperti
 * format rujukannya: dengan spasi 1,5 dan jarak bawaan badan naskah, blok
 * tanda tangan ketua program studi terdorong ke halaman berikutnya.
 */
const SINGLE_SPACED = { lineHeight: '1.15', spaceBefore: 0, spaceAfter: 0 }

const paragraph = (text = '', bold = false, tight = false): FrontMatterNode => ({
	type: 'paragraph',
	attrs: { textAlign: 'center', ...(tight ? SINGLE_SPACED : {}) },
	...(text ? { content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }] } : {}),
})

const cell = (...content: FrontMatterNode[]): FrontMatterNode => ({
	type: 'tableCell',
	attrs: { colspan: 1, rowspan: 1 },
	content: content.length > 0 ? content : [paragraph()],
})

/* Tabel polos: tanpa garis, seperti tabel isian di format rujukannya. */
const table = (rows: FrontMatterNode[][]): FrontMatterNode => ({
	type: 'table',
	attrs: { borderStyle: 'none' },
	content: rows.map((cells) => ({ type: 'tableRow', content: cells })),
})

function membersTable(members: readonly { name: string; id: string }[]): FrontMatterNode {
	return table([
		[cell(paragraph('Nama', true)), cell(paragraph('NIM', true))],
		...members.map((member) => [cell(paragraph(member.name)), cell(paragraph(member.id))]),
	])
}

/**
 * Nilai satu isian: nilai metadata, atau teks contoh berkurungnya bila kosong -
 * penulis melihat persis apa yang masih harus diisi, dan penggantian saat
 * dokumen dibuat menemukannya.
 */
function fieldValue(values: Readonly<Record<string, string>>, field: TemplateMetadataField): string {
	return values[field.key]?.trim() || field.placeholder || ''
}

/**
 * Isi sampul atau halaman pengesahan. `values` kosong menghasilkan kerangka
 * bertanda kurung - itulah yang disimpan di template.
 */
export function frontMatterNodes(
	part: FrontMatterPart,
	spec: FrontMatterSpec,
	values: Readonly<Record<string, string>> = {},
): FrontMatterNode[] {
	const fields = new Map(frontMatterFields('Judul').map((field) => [field.key, field]))
	const get = (key: string) => {
		const field = fields.get(key)
		return field ? fieldValue(values, field) : ''
	}
	const fill = (sentence: string) =>
		sentence
			.replace('[Program Studi]', get('prodi'))
			.replace('[Fakultas]', get('fakultas'))
			.replace('[Universitas]', get('universitas'))
	const members = teamMembers(values.anggota)

	if (part === 'cover') {
		return [
			paragraph(spec.label, true),
			paragraph(),
			paragraph(get('judul'), true),
			paragraph(),
			paragraph(),
			paragraph(fill(spec.purpose)),
			paragraph(),
			paragraph('Disusun oleh:'),
			paragraph(get('nama').toUpperCase(), true),
			paragraph(get('nim'), true),
			...(members.length > 0 ? [paragraph('Anggota Tim:'), membersTable(members)] : []),
			paragraph(),
			paragraph(),
			paragraph(`PROGRAM STUDI ${get('prodi').toUpperCase()}`, true),
			paragraph(`FAKULTAS ${get('fakultas').toUpperCase()}`, true),
			paragraph(get('universitas').toUpperCase(), true),
			paragraph(get('tahun'), true),
		]
	}

	const line = (text = '', bold = false) => paragraph(text, bold, true)
	const signature = (role: string, name: string, id: string): FrontMatterNode =>
		cell(line(role), line(), line(), line(), line(name, true), line(`NIP. ${id}`))

	return [
		line('HALAMAN PENGESAHAN', true),
		line(),
		line(spec.label, true),
		line(get('judul'), true),
		line(),
		line('Disusun oleh:'),
		line(get('nama').toUpperCase(), true),
		line(`NIM. ${get('nim')}`, true),
		...(members.length > 0 ? [line('Anggota Tim:'), membersTable(members)] : []),
		line(),
		line(fill(spec.approval)),
		line(),
		line(`${get('kota')}, ${get('tanggal')}`),
		line(),
		table([
			[
				signature('Pembimbing Utama,', get('pembimbing1'), get('nipPembimbing1')),
				signature('Co-Pembimbing,', get('pembimbing2'), get('nipPembimbing2')),
			],
		]),
		line(),
		line('Mengetahui,'),
		line(`Ketua Program Studi ${get('prodi')}`),
		line(),
		line(),
		line(),
		line(get('kaprodi'), true),
		line(`NIP. ${get('nipKaprodi')}`),
	]
}
