import type { DocumentTypography } from '@writer-hub/shared'
import type { BuiltinTemplateDefinition } from './definition'

/** Margin seragam 2,5 cm - baku dokumen bisnis. */
const MARGIN_2_5 = { top: 94, right: 94, bottom: 94, left: 94 }

/** Margin seragam 2 cm untuk notulen rapat. */
const MARGIN_2 = { top: 76, right: 76, bottom: 76, left: 76 }

/** Margin seragam 3 cm untuk surat resmi. */
const MARGIN_3 = { top: 113, right: 113, bottom: 113, left: 113 }

const ARIAL_11 = { family: 'Arial, Helvetica, sans-serif', sizePt: 11 }

/**
 * Dokumen kantor: paragraf balok tanpa indent, dipisah jarak - bukan indent
 * baris pertama seperti karya ilmiah. Judulnya masih boleh membesar, tapi
 * bertingkat wajar (16/13/11pt), bukan setinggi judul halaman web.
 *
 * Bagian tingkat 1 menyambung di halaman yang sama: memo, surat, notulen, dan
 * CV justru rusak kalau tiap bagiannya dipaksa berhalaman sendiri - CV dua
 * halaman bisa menjadi enam.
 */
const BUSINESS_TYPOGRAPHY: DocumentTypography = {
	baseFont: ARIAL_11,
	lineHeight: 1.15,
	paragraph: { spaceBeforePt: 0, spaceAfterPt: 8 },
	headings: {
		1: { sizePt: 16, spaceBeforePt: 16, spaceAfterPt: 6 },
		2: { sizePt: 13, spaceBeforePt: 12, spaceAfterPt: 4 },
		3: { sizePt: 11, spaceBeforePt: 10, spaceAfterPt: 3 },
		4: { sizePt: 11, italic: true, spaceBeforePt: 8, spaceAfterPt: 2 },
	},
}

/**
 * Untuk dokumen panjang yang tiap bagiannya berdiri sendiri - proposal, laporan
 * berkala, SOP, rencana bisnis. Di sana bagian baru memang dibaca sebagai
 * lembar baru, sama seperti BAB di karya ilmiah.
 */
const BUSINESS_REPORT_TYPOGRAPHY: DocumentTypography = {
	...BUSINESS_TYPOGRAPHY,
	headings: {
		...BUSINESS_TYPOGRAPHY.headings,
		1: { ...BUSINESS_TYPOGRAPHY.headings?.[1], pageBreakBefore: true },
	},
}

/** Margin 2,54 cm untuk CV dan surat. */
const MARGIN_2_54 = { top: 96, right: 96, bottom: 96, left: 96 }

/**
 * Tipografi CV ATS: Arial 11 pt, spasi 1,15, tanpa jarak antarparagraf.
 * H1 tengah 16 pt; H2 14 pt tebal dengan garis bawah; H3 12 pt tebal.
 */
const CV_ATS_TYPOGRAPHY: DocumentTypography = {
	baseFont: ARIAL_11,
	lineHeight: 1.15,
	paragraph: { spaceBeforePt: 0, spaceAfterPt: 0 },
	headings: {
		1: { sizePt: 16, bold: true, align: 'center', spaceBeforePt: 0, spaceAfterPt: 4 },
		2: {
			sizePt: 14,
			bold: true,
			spaceBeforePt: 12,
			spaceAfterPt: 4,
			borderBottom: { widthPt: 0.75, color: '#000000' },
		},
		3: { sizePt: 12, bold: true, spaceBeforePt: 8, spaceAfterPt: 2 },
	},
}

/** Times New Roman 12 pt untuk surat lamaran. */
const TIMES_12 = { family: '"Times New Roman", Times, serif', sizePt: 12 }

/**
 * Tipografi surat lamaran: TNR 12 pt, rata kiri-kanan, spasi 1,15, tanpa jarak
 * antarparagraf. Tanpa heading yang tercetak — semua isi paragraf biasa.
 */
const SURAT_LAMARAN_TYPOGRAPHY: DocumentTypography = {
	baseFont: TIMES_12,
	lineHeight: 1.15,
	paragraph: { align: 'justify', spaceBeforePt: 0, spaceAfterPt: 0 },
}

/** Margin kiri 3 cm, sisi lain 2,5 cm untuk laporan kajian kebijakan. */
const MARGIN_KAJIAN = { top: 94, right: 94, bottom: 94, left: 113 }

/**
 * Tipografi laporan kajian kebijakan: TNR 12 pt, spasi 1,5, rata kiri-kanan.
 * Heading 1 membuka halaman baru.
 */
const KAJIAN_TYPOGRAPHY: DocumentTypography = {
	baseFont: TIMES_12,
	lineHeight: 1.5,
	paragraph: { align: 'justify', spaceBeforePt: 0, spaceAfterPt: 6 },
	headings: {
		1: { sizePt: 14, bold: true, align: 'center', spaceBeforePt: 0, spaceAfterPt: 6, pageBreakBefore: true },
		2: { sizePt: 12, bold: true, spaceBeforePt: 12, spaceAfterPt: 4 },
		3: { sizePt: 12, bold: true, italic: true, spaceBeforePt: 8, spaceAfterPt: 3 },
	},
}

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
				typography: BUSINESS_REPORT_TYPOGRAPHY,
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
				typography: BUSINESS_REPORT_TYPOGRAPHY,
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
				typography: BUSINESS_REPORT_TYPOGRAPHY,
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
				typography: BUSINESS_TYPOGRAPHY,
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
				typography: BUSINESS_TYPOGRAPHY,
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
				typography: BUSINESS_TYPOGRAPHY,
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
		description: 'Surat lamaran formal dengan blok data berurut, tab stop, dan daftar lampiran.',
		category: 'business',
		locale: 'id',
		position: 6,
		markdown: `{:align=right}
[Kota], [Tanggal Bulan Tahun]

Kepada Yth.
[Jabatan Penerima]
[Nama Perusahaan]
[Alamat Perusahaan]

Hal: Lamaran Pekerjaan [Posisi]

Dengan hormat,

Saya yang bertanda tangan di bawah ini:

{:tabs=90pt:left}
Nama\t: [Nama Lengkap]
Tempat, Tanggal Lahir\t: [Tempat], [Tanggal Lahir]
Alamat\t: [Alamat Lengkap]
No. HP\t: [Nomor HP]
Email\t: [Alamat Email]
Pendidikan Terakhir\t: [Pendidikan Terakhir]

Saya bermaksud melamar posisi [Posisi] di [Nama Perusahaan]. [Alasan singkat mengapa tertarik dengan posisi tersebut dan ringkasan kualifikasi yang relevan.]

Bersama surat ini saya melampirkan:

1. Daftar Riwayat Hidup (CV)
2. Fotokopi KTP
3. Fotokopi Ijazah dan Transkrip Nilai yang Dilegalisasi
4. Pas Foto 3x4 (2 lembar)
5. [Dokumen pendukung lain]

Demikian surat lamaran ini saya buat dengan sebenar-benarnya. Atas perhatian Bapak/Ibu, saya ucapkan terima kasih.

Hormat saya,



**[Nama Lengkap]**
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_54,
					pageColor: null,
					pageless: false,
				},
				typography: SURAT_LAMARAN_TYPOGRAPHY,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [],
			aiRules: [
				'This document is an Indonesian job application letter (surat lamaran kerja).',
				'Write in formal, courteous Indonesian (bahasa baku); keep it to one page.',
				'Do not add any heading or title — this letter has no printed headings.',
				'Fill every placeholder in square brackets using replace_text; do not leave any.',
				'The applicant data block uses tab stops to align colons; keep them aligned.',
				'The attachment list is numbered and must include all five items.',
			],
		},
	},
	{
		slug: 'cv-ats',
		name: 'CV / Resume (ATS)',
		description: 'CV satu kolom ramah ATS dengan garis bawah judul bagian dan entri pengalaman.',
		category: 'business',
		locale: 'id',
		position: 7,
		markdown: `# [Nama Lengkap]

{:align=center}
[Posisi yang Dilamar]

{:align=center}
[Kota] | [Nomor HP] | [Email] | [LinkedIn]

## RINGKASAN

[Ringkasan profil profesional singkat dalam 2-3 kalimat.]

## PENGALAMAN KERJA

### [Nama Perusahaan] – [Kota]

{:align=right}
([Bulan Tahun]–[Bulan Tahun/sekarang])

**[Jabatan] ([Status Kerja])**

- [Pencapaian atau tanggung jawab utama]
- [Pencapaian atau tanggung jawab utama]

## PENDIDIKAN

**[Nama Institusi]**

{:align=right}
([Tahun]–[Tahun])

[Program Studi] – IPK [x]

## KEAHLIAN

**Hard Skills**
[Keahlian teknis], [Keahlian teknis], [Keahlian teknis]

**Soft Skills**
[Keahlian non-teknis], [Keahlian non-teknis], [Keahlian non-teknis]

## SERTIFIKASI

- [Nama Sertifikasi] – [Penerbit], [Tahun]
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_54,
					pageColor: null,
					pageless: false,
				},
				typography: CV_ATS_TYPOGRAPHY,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: '[Nama Lengkap]', level: 1, required: true, hint: 'Replace with applicant name' },
				{ heading: 'RINGKASAN', level: 2, required: true },
				{ heading: 'PENGALAMAN KERJA', level: 2, required: true },
				{ heading: 'PENDIDIKAN', level: 2, required: true },
				{ heading: 'KEAHLIAN', level: 2, required: true },
				{ heading: 'SERTIFIKASI', level: 2, required: false },
			],
			aiRules: [
				'This document is an Indonesian ATS-friendly CV: one column, no tables, no graphics.',
				'Fill every placeholder in square brackets; do not leave any unfilled.',
				'The H1 heading "[Nama Lengkap]" is a placeholder — replace it with the actual name using new_heading.',
				'Write achievement-oriented bullet points starting with action verbs.',
				'Keep reverse-chronological order: newest experience and education first.',
				'Use UPPERCASE section names (RINGKASAN, PENGALAMAN KERJA, etc.) as they are standard for ATS parsers.',
				'To start the cover letter in a second tab, use create_tab with template: "surat-lamaran-kerja".',
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
				typography: BUSINESS_REPORT_TYPOGRAPHY,
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
				typography: BUSINESS_REPORT_TYPOGRAPHY,
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
	{
		slug: 'laporan-kajian-kebijakan',
		name: 'Laporan Kajian Kebijakan',
		description: 'Laporan kajian kebijakan formal: ringkasan eksekutif, analisis, rekomendasi.',
		category: 'business',
		locale: 'id',
		position: 10,
		markdown: `# [Judul Kajian Kebijakan]

[Instansi/Penyusun]

[Kota], [Tahun]

# Ringkasan Eksekutif

# Daftar Isi

# BAB I Pendahuluan

## Latar Belakang

## Rumusan Masalah

## Tujuan Kajian

## Ruang Lingkup

## Metodologi dan Sumber Data

# BAB II Gambaran Kebijakan

## Dasar Hukum dan Kelembagaan

## Tujuan dan Sasaran

## Anggaran

## Jangkauan dan Pelaksanaan

# BAB III Analisis

## Temuan di Lapangan

## Analisis Alternatif Kebijakan

## Analisis Risiko

# BAB IV Rekomendasi

# BAB V Kesimpulan

# Daftar Pustaka

# Lampiran
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_KAJIAN,
					pageColor: null,
					pageless: false,
				},
				typography: KAJIAN_TYPOGRAPHY,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: '[Judul Kajian Kebijakan]', level: 1, required: true, hint: 'Replace with actual title' },
				{ heading: 'Ringkasan Eksekutif', level: 1, required: true },
				{ heading: 'Daftar Isi', level: 1, required: true },
				{ heading: 'BAB I Pendahuluan', level: 1, required: true },
				{ heading: 'Latar Belakang', level: 2, required: true },
				{ heading: 'Rumusan Masalah', level: 2, required: true },
				{ heading: 'Tujuan Kajian', level: 2, required: true },
				{ heading: 'Ruang Lingkup', level: 2, required: true },
				{ heading: 'Metodologi dan Sumber Data', level: 2, required: true },
				{ heading: 'BAB II Gambaran Kebijakan', level: 1, required: true },
				{ heading: 'Dasar Hukum dan Kelembagaan', level: 2, required: true },
				{ heading: 'Tujuan dan Sasaran', level: 2, required: true },
				{ heading: 'Anggaran', level: 2, required: true },
				{ heading: 'Jangkauan dan Pelaksanaan', level: 2, required: true },
				{ heading: 'BAB III Analisis', level: 1, required: true },
				{ heading: 'Temuan di Lapangan', level: 2, required: true },
				{ heading: 'Analisis Alternatif Kebijakan', level: 2, required: true },
				{ heading: 'Analisis Risiko', level: 2, required: true },
				{ heading: 'BAB IV Rekomendasi', level: 1, required: true },
				{ heading: 'BAB V Kesimpulan', level: 1, required: true },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
				{ heading: 'Lampiran', level: 1, required: false },
			],
			aiRules: [
				'This document is an Indonesian policy analysis report (laporan kajian kebijakan).',
				'Fill every placeholder in square brackets; do not leave any unfilled.',
				'Every fact and figure must have a source.',
				'Daftar Pustaka uses APA 7th edition format.',
				'Tables and figures must be numbered, titled, and sourced (e.g., Tabel 1, Gambar 1).',
				'Recommendations in BAB IV must follow the evidence presented in BAB III.',
				'Present pro and contra arguments in a balanced manner.',
				'Each BAB (chapter) starts on a new page.',
			],
			caveats: [
				'Acuan yang diberikan adalah salinan bab buku ajar, bukan template resmi. Struktur mengikuti format kajian kebijakan yang lazim di Indonesia.',
			],
		},
	},
]
