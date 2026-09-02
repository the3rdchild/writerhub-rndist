import type { BuiltinTemplateDefinition } from './definition'

/** Margin seragam 2,5 cm - baku dokumen bisnis. */
const MARGIN_2_5 = { top: 94, right: 94, bottom: 94, left: 94 }

/** Margin seragam 2 cm untuk notulen rapat. */
const MARGIN_2 = { top: 76, right: 76, bottom: 76, left: 76 }

/** Margin seragam 3 cm untuk surat resmi. */
const MARGIN_3 = { top: 113, right: 113, bottom: 113, left: 113 }

/** Margin seragam 1,5 cm untuk CV ATS. */
const MARGIN_1_5 = { top: 57, right: 57, bottom: 57, left: 57 }

const ARIAL_11 = { family: 'Arial, Helvetica, sans-serif', sizePt: 11 }

export const BUSINESS_TEMPLATES: BuiltinTemplateDefinition[] = [
	{
		slug: 'proposal-proyek',
		name: 'Proposal Proyek',
		description: 'Proposal proyek dengan tabel jadwal dan anggaran siap isi.',
		category: 'business',
		locale: 'id',
		position: 0,
		markdown: `# Judul Proposal Proyek

**Nama Perusahaan / Tim**
Diajukan kepada: Nama Klien
Tanggal

# Ringkasan Eksekutif

# Latar Belakang

# Ruang Lingkup

# Pendekatan

# Jadwal

| Tahap | Kegiatan | Waktu | Penanggung Jawab |
|---|---|---|---|
| 1 | Persiapan | Minggu 1-2 | |
| 2 | Pelaksanaan | Minggu 3-8 | |
| 3 | Serah terima | Minggu 9 | |

# Anggaran

| Komponen | Kuantitas | Harga Satuan | Total |
|---|---|---|---|
| | | | |
| **Total** | | | |

# Tim

# Syarat dan Ketentuan
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Proposal Proyek', level: 1, required: true },
				{ heading: 'Ringkasan Eksekutif', level: 1, required: true },
				{ heading: 'Latar Belakang', level: 1, required: true },
				{ heading: 'Ruang Lingkup', level: 1, required: true },
				{ heading: 'Pendekatan', level: 1, required: true },
				{ heading: 'Jadwal', level: 1, required: true, hint: 'Berbentuk tabel' },
				{ heading: 'Anggaran', level: 1, required: true, hint: 'Berbentuk tabel' },
				{ heading: 'Tim', level: 1, required: true },
				{ heading: 'Syarat dan Ketentuan', level: 1, required: false },
			],
			aiRules: [
				'This document is an Indonesian project proposal for a client.',
				'Write in clear, formal business Indonesian.',
				'Keep Jadwal and Anggaran as tables; never convert them to prose.',
				'Ringkasan Eksekutif summarizes the whole proposal in one paragraph.',
				'Do not add citations; this is a business document.',
			],
		},
	},
	{
		slug: 'laporan-bulanan',
		name: 'Laporan Bulanan',
		description: 'Laporan bulanan dengan tabel pencapaian versus target.',
		category: 'business',
		locale: 'id',
		position: 1,
		markdown: `# Laporan Bulanan - Bulan Tahun

**Unit / Departemen**
Penyusun: Nama

# Ringkasan

# Pencapaian vs Target

| Indikator | Target | Realisasi | Keterangan |
|---|---|---|---|
| | | | |

# Metrik Utama

# Kendala

# Rencana Bulan Depan
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Laporan Bulanan - Bulan Tahun', level: 1, required: true },
				{ heading: 'Ringkasan', level: 1, required: true },
				{ heading: 'Pencapaian vs Target', level: 1, required: true, hint: 'Berbentuk tabel' },
				{ heading: 'Metrik Utama', level: 1, required: true },
				{ heading: 'Kendala', level: 1, required: true },
				{ heading: 'Rencana Bulan Depan', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian monthly business report.',
				'Write concisely in formal business Indonesian; use numbers over adjectives.',
				'Keep Pencapaian vs Target as a table with numeric values.',
				'Rencana Bulan Depan must answer the obstacles listed in Kendala.',
			],
		},
	},
	{
		slug: 'laporan-kuartalan',
		name: 'Laporan Kuartalan',
		description: 'Laporan per kuartal: kinerja per lini, analisis, risiko, dan rekomendasi.',
		category: 'business',
		locale: 'id',
		position: 2,
		markdown: `# Laporan Kuartalan - Q1 Tahun

**Nama Perusahaan / Unit**
Penyusun: Nama

# Ringkasan Eksekutif

# Kinerja per Lini

# Analisis

# Risiko

# Rekomendasi
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Laporan Kuartalan - Q1 Tahun', level: 1, required: true },
				{ heading: 'Ringkasan Eksekutif', level: 1, required: true },
				{ heading: 'Kinerja per Lini', level: 1, required: true },
				{ heading: 'Analisis', level: 1, required: true },
				{ heading: 'Risiko', level: 1, required: true },
				{ heading: 'Rekomendasi', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian quarterly business report.',
				'Write in formal business Indonesian with a strategic, not operational, tone.',
				'Ringkasan Eksekutif stands alone for executives who read nothing else.',
				'Every Rekomendasi must trace back to a finding in Analisis or Risiko.',
			],
		},
	},
	{
		slug: 'notulen-rapat',
		name: 'Notulen Rapat',
		description: 'Notulen dengan info rapat, keputusan, dan tabel tindak lanjut ber-PIC.',
		category: 'business',
		locale: 'id',
		position: 3,
		markdown: `# Notulen Rapat

**Hari/Tanggal:** 
**Waktu:** 
**Tempat:** 
**Pimpinan Rapat:** 
**Peserta:** 
**Notulis:** 

# Agenda

1. Agenda pertama
2. Agenda kedua

# Pembahasan

# Keputusan

# Tindak Lanjut

| Item | PIC | Tenggat |
|---|---|---|
| | | |
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Notulen Rapat', level: 1, required: true },
				{ heading: 'Agenda', level: 1, required: true },
				{ heading: 'Pembahasan', level: 1, required: true },
				{ heading: 'Keputusan', level: 1, required: true },
				{ heading: 'Tindak Lanjut', level: 1, required: true, hint: 'Tabel: item, PIC, tenggat' },
			],
			aiRules: [
				'This document is Indonesian meeting minutes (notulen).',
				'Write factually and chronologically; attribute statements when attribution matters.',
				'Separate Keputusan from Pembahasan: decisions are final statements, not discussion.',
				'Keep Tindak Lanjut as a table with item, person in charge (PIC), and deadline.',
			],
		},
	},
	{
		slug: 'memo-internal',
		name: 'Memo Internal',
		description: 'Memo internal ringkas dengan blok Kepada/Dari/Tanggal/Perihal.',
		category: 'business',
		locale: 'id',
		position: 4,
		markdown: `# Memo Internal

**Kepada:** Nama / Jabatan
**Dari:** Nama / Jabatan
**Tanggal:** 
**Perihal:** 

# Isi

# Tindakan yang Diminta
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Memo Internal', level: 1, required: true },
				{ heading: 'Isi', level: 1, required: true },
				{ heading: 'Tindakan yang Diminta', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian internal memo.',
				'Write briefly and directly; a memo rarely exceeds one page.',
				'State the requested action explicitly in Tindakan yang Diminta.',
				'Keep the Kepada/Dari/Tanggal/Perihal header block intact.',
			],
		},
	},
	{
		slug: 'surat-resmi',
		name: 'Surat Resmi',
		description: 'Surat resmi berkop (di header halaman) dengan nomor, perihal, dan tembusan.',
		category: 'business',
		locale: 'id',
		position: 5,
		markdown: `# Surat Resmi

**Nomor:** 001/DIR/IX/2026
**Lampiran:** -
**Perihal:** 

## Alamat Tujuan

Kepada Yth.
Bapak/Ibu Pimpinan
Nama Instansi
Alamat

## Isi Surat

Dengan hormat,

## Salam Penutup

Hormat kami,

**Nama Lengkap**
Jabatan

**Tembusan:**
1. Arsip
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_3,
					pageColor: null,
					pageless: false,
				},
				furniture: {
					header: {
						default: { text: 'NAMA INSTANSI | Alamat | Telepon', align: 'center' },
					},
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Surat Resmi', level: 1, required: true },
				{ heading: 'Alamat Tujuan', level: 2, required: true },
				{ heading: 'Isi Surat', level: 2, required: true },
				{ heading: 'Salam Penutup', level: 2, required: true },
			],
			aiRules: [
				'This document is an Indonesian formal letter (surat resmi) with a letterhead in the page header.',
				'Write in formal, courteous Indonesian (bahasa baku).',
				'Keep the Nomor/Lampiran/Perihal block at the top of the body.',
				'Do not invent letter numbers or dates; leave placeholders when unknown.',
			],
			caveats: ['Kop surat diatur sebagai header halaman - sunting lewat pengaturan header/footer.'],
		},
	},
	{
		slug: 'surat-lamaran-kerja',
		name: 'Surat Lamaran Kerja',
		description: 'Surat lamaran dengan data pelamar, isi, dan daftar lampiran berkas.',
		category: 'business',
		locale: 'id',
		position: 6,
		markdown: `# Surat Lamaran Kerja

**Nama:** 
**Tempat, Tanggal Lahir:** 
**Alamat:** 
**Telepon:** 
**Email:** 

Kepada Yth.
Bapak/Ibu Pimpinan HRD
Nama Perusahaan
Alamat

Dengan hormat,

*Sampaikan posisi yang dilamar, alasan melamar, dan ringkasan pengalaman yang relevan.*

## Lampiran Berkas

1. Daftar Riwayat Hidup
2. Ijazah dan transkrip nilai
3. Sertifikat pendukung

Hormat saya,

**Nama Lengkap**
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Surat Lamaran Kerja', level: 1, required: true },
				{ heading: 'Lampiran Berkas', level: 2, required: true },
			],
			aiRules: [
				'This document is an Indonesian job application letter (surat lamaran kerja).',
				'Write in formal, courteous Indonesian (bahasa baku); keep it to one page.',
				'The body states the applied position, the reason for applying, and a brief experience summary.',
				'Keep the applicant data block at the top and the attachment list numbered.',
			],
		},
	},
	{
		slug: 'cv-ats',
		name: 'CV / Resume (ATS)',
		description: 'CV satu kolom ramah ATS: ringkasan, pengalaman, pendidikan, keahlian.',
		category: 'business',
		locale: 'id',
		position: 7,
		markdown: `# Nama Lengkap

Alamat | Telepon | Email | LinkedIn

## Ringkasan

## Pengalaman Kerja

**Jabatan** - Nama Perusahaan (Tahun - Tahun)

- Pencapaian atau tanggung jawab utama

## Pendidikan

**Gelar** - Nama Institusi (Tahun - Tahun)

## Keahlian

## Sertifikasi
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_1_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Nama Lengkap', level: 1, required: true, hint: 'Dengan baris kontak' },
				{ heading: 'Ringkasan', level: 2, required: true },
				{ heading: 'Pengalaman Kerja', level: 2, required: true },
				{ heading: 'Pendidikan', level: 2, required: true },
				{ heading: 'Keahlian', level: 2, required: true },
				{ heading: 'Sertifikasi', level: 2, required: false },
			],
			aiRules: [
				'This document is an Indonesian ATS-friendly CV: one column, no tables, no graphics.',
				'Write achievement-oriented bullet points starting with action verbs.',
				'Keep reverse-chronological order: newest experience and education first.',
				'Use standard section names; ATS parsers look for them.',
			],
			caveats: ['Sengaja satu kolom tanpa tabel atau grafis agar terbaca sistem ATS.'],
		},
	},
	{
		slug: 'sop',
		name: 'SOP',
		description: 'Prosedur operasional standar dengan langkah bernomor dan tabel riwayat revisi.',
		category: 'business',
		locale: 'id',
		position: 8,
		markdown: `# Standar Operasional Prosedur (SOP)

**Nomor SOP:** 
**Unit:** 
**Tanggal Berlaku:** 

# Tujuan

# Ruang Lingkup

# Definisi

# Tanggung Jawab

# Prosedur

1. Langkah pertama
2. Langkah kedua
3. Langkah ketiga

# Referensi

# Riwayat Revisi

| Versi | Tanggal | Perubahan | Penyusun |
|---|---|---|---|
| 1.0 | | Penerbitan awal | |
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Standar Operasional Prosedur (SOP)', level: 1, required: true },
				{ heading: 'Tujuan', level: 1, required: true },
				{ heading: 'Ruang Lingkup', level: 1, required: true },
				{ heading: 'Definisi', level: 1, required: true },
				{ heading: 'Tanggung Jawab', level: 1, required: true },
				{ heading: 'Prosedur', level: 1, required: true, hint: 'Langkah bernomor' },
				{ heading: 'Referensi', level: 1, required: false },
				{ heading: 'Riwayat Revisi', level: 1, required: true, hint: 'Berbentuk tabel' },
			],
			aiRules: [
				'This document is an Indonesian standard operating procedure (SOP).',
				'Write procedure steps as numbered imperatives: one action per step.',
				'Define every technical term in Definisi before using it in Prosedur.',
				'Keep Riwayat Revisi as a table; bump the version on every change.',
			],
		},
	},
	{
		slug: 'rencana-bisnis',
		name: 'Rencana Bisnis Ringkas',
		description: 'Rencana bisnis ringkas: masalah, solusi, pasar, model bisnis, proyeksi.',
		category: 'business',
		locale: 'id',
		position: 9,
		markdown: `# Rencana Bisnis - Nama Usaha

**Penyusun:** 
**Tanggal:** 

# Ringkasan

# Masalah dan Solusi

# Pasar

# Model Bisnis

# Kompetisi

# Proyeksi Keuangan

# Tim
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_11,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Rencana Bisnis - Nama Usaha', level: 1, required: true },
				{ heading: 'Ringkasan', level: 1, required: true },
				{ heading: 'Masalah dan Solusi', level: 1, required: true },
				{ heading: 'Pasar', level: 1, required: true },
				{ heading: 'Model Bisnis', level: 1, required: true },
				{ heading: 'Kompetisi', level: 1, required: true },
				{ heading: 'Proyeksi Keuangan', level: 1, required: true },
				{ heading: 'Tim', level: 1, required: true },
			],
			aiRules: [
				'This document is a concise Indonesian business plan.',
				'Write persuasively but back every claim with a number or an assumption.',
				'Keep Masalah dan Solusi paired: each stated problem has its solution beside it.',
				'Proyeksi Keuangan states assumptions explicitly, not just totals.',
			],
		},
	},
]
