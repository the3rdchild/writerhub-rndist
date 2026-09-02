import type { BuiltinTemplateDefinition } from './definition'

/** Margin skripsi Indonesia: kiri 4 cm untuk jilid, sisanya 3 cm. */
const MARGIN_4_3_3_3 = { top: 113, right: 113, bottom: 113, left: 151 }

/** Margin seragam 3 cm untuk praktikum dan makalah. */
const MARGIN_3_3_3_3 = { top: 113, right: 113, bottom: 113, left: 113 }

/** Margin seragam 2,5 cm untuk artikel jurnal nasional. */
const MARGIN_2_5_2_5_2_5 = { top: 94, right: 94, bottom: 94, left: 94 }

const TIMES_12 = { family: '"Times New Roman", Times, serif', sizePt: 12 }

export const ACADEMIC_ID_TEMPLATES: BuiltinTemplateDefinition[] = [
	{
		slug: 'skripsi-s1',
		name: 'Skripsi (S1)',
		description: 'Struktur BAB I-V lengkap dengan abstrak dwibahasa dan daftar pustaka APA 7.',
		category: 'academic_id',
		locale: 'id',
		position: 0,
		markdown: `# Judul Skripsi

**Nama Mahasiswa** - NIM 1234567890
Program Studi - Fakultas - Universitas
Tahun

# Halaman Pengesahan

# Pernyataan Orisinalitas

# Abstrak

*Abstrak bahasa Indonesia, 150-250 kata, satu paragraf.*

**Kata kunci:** kata kunci 1, kata kunci 2, kata kunci 3

# Abstract

*English abstract, 150-250 words, one paragraph.*

**Keywords:** keyword 1, keyword 2, keyword 3

# Kata Pengantar

# Daftar Isi

# Daftar Tabel

# Daftar Gambar

# BAB I Pendahuluan

## Latar Belakang

## Rumusan Masalah

## Tujuan Penelitian

## Manfaat Penelitian

## Batasan Masalah

# BAB II Tinjauan Pustaka

# BAB III Metodologi

# BAB IV Hasil dan Pembahasan

# BAB V Penutup

## Simpulan

## Saran

# Daftar Pustaka

# Lampiran
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_4_3_3_3,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'bab-romawi',
				abstractWords: [150, 250],
				language: 'id',
			},
			structure: [
				{ heading: 'Judul', level: 1, required: true },
				{ heading: 'Halaman Pengesahan', level: 1, required: true },
				{ heading: 'Pernyataan Orisinalitas', level: 1, required: true },
				{ heading: 'Abstrak', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true },
				{ heading: 'Kata Pengantar', level: 1, required: false },
				{ heading: 'Daftar Isi', level: 1, required: true },
				{ heading: 'BAB I Pendahuluan', level: 1, required: true },
				{ heading: 'Latar Belakang', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'Rumusan Masalah', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'Tujuan Penelitian', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'BAB II Tinjauan Pustaka', level: 1, required: true },
				{ heading: 'BAB III Metodologi', level: 1, required: true },
				{ heading: 'BAB IV Hasil dan Pembahasan', level: 1, required: true },
				{ heading: 'BAB V Penutup', level: 1, required: true },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
				{ heading: 'Lampiran', level: 1, required: false },
			],
			aiRules: [
				'This document is an Indonesian undergraduate thesis (skripsi) with five chapters: BAB I Pendahuluan, BAB II Tinjauan Pustaka, BAB III Metodologi, BAB IV Hasil dan Pembahasan, BAB V Penutup.',
				'Write in formal academic Indonesian (bahasa baku).',
				'Cite sources in APA 7th edition author-year style, e.g. (Santoso, 2023).',
				'BAB I must contain Latar Belakang, Rumusan Masalah, Tujuan Penelitian, Manfaat Penelitian, and Batasan Masalah as subsections.',
				'The abstract is one paragraph of 150-250 words, followed by keywords.',
			],
			caveats: [
				'Nomor halaman romawi (i, ii, iii) di bagian awal belum otomatis - atur manual.',
				'Daftar isi belum memuat nomor halaman otomatis.',
			],
		},
	},
	{
		slug: 'tesis-s2',
		name: 'Tesis (S2)',
		description: 'Struktur enam BAB dengan kerangka teori terpisah dan abstrak yang lebih panjang.',
		category: 'academic_id',
		locale: 'id',
		position: 1,
		markdown: `# Judul Tesis

**Nama Mahasiswa** - NIM 1234567890
Program Studi - Program Pascasarjana - Universitas
Tahun

# Halaman Pengesahan

# Pernyataan Orisinalitas

# Abstrak

*Abstrak bahasa Indonesia, 200-300 kata, satu paragraf.*

**Kata kunci:** kata kunci 1, kata kunci 2, kata kunci 3

# Abstract

*English abstract, 200-300 words, one paragraph.*

**Keywords:** keyword 1, keyword 2, keyword 3

# Kata Pengantar

# Daftar Isi

# Daftar Tabel

# Daftar Gambar

# BAB I Pendahuluan

## Latar Belakang

## Rumusan Masalah

## Tujuan Penelitian

## Manfaat Penelitian

# BAB II Tinjauan Pustaka

# BAB III Kerangka Teori

# BAB IV Metodologi Penelitian

# BAB V Hasil dan Pembahasan

# BAB VI Penutup

## Simpulan

## Saran

# Daftar Pustaka

# Lampiran
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_4_3_3_3,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'bab-romawi',
				abstractWords: [200, 300],
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Tesis', level: 1, required: true },
				{ heading: 'Halaman Pengesahan', level: 1, required: true },
				{ heading: 'Pernyataan Orisinalitas', level: 1, required: true },
				{ heading: 'Abstrak', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true },
				{ heading: 'Kata Pengantar', level: 1, required: false },
				{ heading: 'Daftar Isi', level: 1, required: true },
				{ heading: 'BAB I Pendahuluan', level: 1, required: true },
				{ heading: 'Latar Belakang', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'Rumusan Masalah', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'Tujuan Penelitian', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'BAB II Tinjauan Pustaka', level: 1, required: true },
				{ heading: 'BAB III Kerangka Teori', level: 1, required: true },
				{ heading: 'BAB IV Metodologi Penelitian', level: 1, required: true },
				{ heading: 'BAB V Hasil dan Pembahasan', level: 1, required: true },
				{ heading: 'BAB VI Penutup', level: 1, required: true },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
				{ heading: 'Lampiran', level: 1, required: false },
			],
			aiRules: [
				'This document is an Indonesian master thesis (tesis) with six chapters, including a separate theoretical framework chapter (BAB III Kerangka Teori).',
				'Write in formal academic Indonesian (bahasa baku).',
				'Cite sources in APA 7th edition author-year style, e.g. (Santoso, 2023).',
				'The abstract is one paragraph of 200-300 words, followed by keywords.',
				'Keep Kerangka Teori separate from Tinjauan Pustaka: review first, theory second.',
			],
			caveats: [
				'Nomor halaman romawi (i, ii, iii) di bagian awal belum otomatis - atur manual.',
				'Daftar isi belum memuat nomor halaman otomatis.',
			],
		},
	},
	{
		slug: 'disertasi-s3',
		name: 'Disertasi (S3)',
		description: 'Kerangka disertasi dengan ringkasan, bab kebaruan penelitian, dan spasi ganda.',
		category: 'academic_id',
		locale: 'id',
		position: 2,
		markdown: `# Judul Disertasi

**Nama Mahasiswa** - NIM 1234567890
Program Studi - Program Pascasarjana - Universitas
Tahun

# Halaman Pengesahan

# Pernyataan Orisinalitas

# Abstrak

*Abstrak bahasa Indonesia, 250-350 kata, satu paragraf.*

**Kata kunci:** kata kunci 1, kata kunci 2, kata kunci 3

# Abstract

*English abstract, 250-350 words, one paragraph.*

**Keywords:** keyword 1, keyword 2, keyword 3

# Ringkasan Disertasi

*Ringkasan satu-dua halaman: masalah, pendekatan, dan kontribusi utama.*

# Kata Pengantar

# Daftar Isi

# Daftar Tabel

# Daftar Gambar

# BAB I Pendahuluan

## Latar Belakang

## Rumusan Masalah

## Tujuan Penelitian

## Manfaat Penelitian

## Kebaruan Penelitian

# BAB II Tinjauan Pustaka

# BAB III Kerangka Teori

# BAB IV Metodologi Penelitian

# BAB V Hasil dan Pembahasan

# BAB VI Penutup

## Simpulan

## Saran

# Daftar Pustaka

# Lampiran
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_4_3_3_3,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 2,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'bab-romawi',
				abstractWords: [250, 350],
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Disertasi', level: 1, required: true },
				{ heading: 'Halaman Pengesahan', level: 1, required: true },
				{ heading: 'Pernyataan Orisinalitas', level: 1, required: true },
				{ heading: 'Abstrak', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true },
				{ heading: 'Ringkasan Disertasi', level: 1, required: true },
				{ heading: 'Kata Pengantar', level: 1, required: false },
				{ heading: 'Daftar Isi', level: 1, required: true },
				{ heading: 'BAB I Pendahuluan', level: 1, required: true },
				{ heading: 'Kebaruan Penelitian', level: 2, required: true, hint: 'Novelty/kontribusi disertasi' },
				{ heading: 'BAB II Tinjauan Pustaka', level: 1, required: true },
				{ heading: 'BAB III Kerangka Teori', level: 1, required: true },
				{ heading: 'BAB IV Metodologi Penelitian', level: 1, required: true },
				{ heading: 'BAB V Hasil dan Pembahasan', level: 1, required: true },
				{ heading: 'BAB VI Penutup', level: 1, required: true },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
				{ heading: 'Lampiran', level: 1, required: false },
			],
			aiRules: [
				'This document is an Indonesian doctoral dissertation (disertasi) with double line spacing.',
				'Write in formal academic Indonesian (bahasa baku).',
				'Cite sources in APA 7th edition author-year style, e.g. (Santoso, 2023).',
				'BAB I must state the research novelty (Kebaruan Penelitian) explicitly.',
				'The Ringkasan Disertasi summarizes the problem, approach, and main contribution in one or two pages.',
				'The abstract is one paragraph of 250-350 words, followed by keywords.',
			],
			caveats: [
				'Nomor halaman romawi (i, ii, iii) di bagian awal belum otomatis - atur manual.',
				'Daftar isi belum memuat nomor halaman otomatis.',
			],
		},
	},
	{
		slug: 'proposal-penelitian',
		name: 'Proposal Penelitian',
		description: 'Kerangka BAB I-III dengan tabel jadwal penelitian dan daftar pustaka APA 7.',
		category: 'academic_id',
		locale: 'id',
		position: 3,
		markdown: `# Judul Proposal Penelitian

**Nama Peneliti** - NIM 1234567890
Program Studi - Fakultas - Universitas
Tahun

# BAB I Pendahuluan

## Latar Belakang

## Rumusan Masalah

## Tujuan Penelitian

## Manfaat Penelitian

# BAB II Tinjauan Pustaka

# BAB III Metodologi Penelitian

## Pendekatan dan Jenis Penelitian

## Teknik Pengumpulan Data

## Teknik Analisis Data

# Jadwal Penelitian

| Kegiatan | Bulan 1 | Bulan 2 | Bulan 3 | Bulan 4 |
|---|---|---|---|---|
| Penyusunan proposal | ✓ | | | |
| Pengumpulan data | | ✓ | ✓ | |
| Analisis data | | | ✓ | |
| Penyusunan laporan | | | | ✓ |

# Daftar Pustaka
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_4_3_3_3,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'bab-romawi',
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Proposal Penelitian', level: 1, required: true },
				{ heading: 'BAB I Pendahuluan', level: 1, required: true },
				{ heading: 'Latar Belakang', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'Rumusan Masalah', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'Tujuan Penelitian', level: 2, required: true, hint: 'Bagian wajib BAB I' },
				{ heading: 'BAB II Tinjauan Pustaka', level: 1, required: true },
				{ heading: 'BAB III Metodologi Penelitian', level: 1, required: true },
				{ heading: 'Jadwal Penelitian', level: 1, required: true, hint: 'Berbentuk tabel' },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian research proposal limited to BAB I-III plus a schedule table.',
				'Write in formal academic Indonesian (bahasa baku).',
				'Cite sources in APA 7th edition author-year style, e.g. (Santoso, 2023).',
				'Keep the Jadwal Penelitian as a Markdown table mapping activities to months.',
				'Do not add chapters beyond BAB III; results chapters belong to the thesis, not the proposal.',
			],
		},
	},
	{
		slug: 'laporan-kerja-praktik',
		name: 'Laporan Kerja Praktik / Magang',
		description: 'Kerangka laporan KP: profil instansi, pelaksanaan, pembahasan, dan lampiran logbook.',
		category: 'academic_id',
		locale: 'id',
		position: 4,
		markdown: `# Judul Laporan Kerja Praktik

**Nama Mahasiswa** - NIM 1234567890
Program Studi - Fakultas - Universitas
Nama Instansi
Tahun

# Lembar Pengesahan

# Kata Pengantar

# Daftar Isi

# BAB I Pendahuluan

## Latar Belakang

## Tujuan Kerja Praktik

## Manfaat Kerja Praktik

# BAB II Profil Instansi

# BAB III Pelaksanaan Kerja Praktik

# BAB IV Pembahasan

# BAB V Penutup

## Simpulan

## Saran

# Daftar Pustaka

# Lampiran

*Lampiran utama berupa logbook harian selama kerja praktik.*
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_4_3_3_3,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'bab-romawi',
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Laporan Kerja Praktik', level: 1, required: true },
				{ heading: 'Lembar Pengesahan', level: 1, required: true },
				{ heading: 'Kata Pengantar', level: 1, required: false },
				{ heading: 'Daftar Isi', level: 1, required: true },
				{ heading: 'BAB I Pendahuluan', level: 1, required: true },
				{ heading: 'BAB II Profil Instansi', level: 1, required: true },
				{ heading: 'BAB III Pelaksanaan Kerja Praktik', level: 1, required: true },
				{ heading: 'BAB IV Pembahasan', level: 1, required: true },
				{ heading: 'BAB V Penutup', level: 1, required: true },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
				{ heading: 'Lampiran', level: 1, required: false, hint: 'Logbook harian' },
			],
			aiRules: [
				'This document is an Indonesian internship report (laporan kerja praktik).',
				'Write in formal academic Indonesian (bahasa baku).',
				'Cite sources in APA 7th edition author-year style, e.g. (Santoso, 2023).',
				'Separate what was done (BAB III Pelaksanaan) from its analysis (BAB IV Pembahasan).',
				'Keep the logbook in the appendix, not in the main chapters.',
			],
		},
	},
	{
		slug: 'laporan-praktikum',
		name: 'Laporan Praktikum',
		description: 'Kerangka praktikum dengan tabel data pengamatan dan sitasi Vancouver.',
		category: 'academic_id',
		locale: 'id',
		position: 5,
		markdown: `# Judul Praktikum

**Nama Praktikan** - NIM 1234567890
Kelompok / Asisten
Tanggal Praktikum

# Tujuan

# Dasar Teori

# Alat dan Bahan

# Prosedur

# Data Pengamatan

| No | Variabel | Hasil Pengamatan | Satuan |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

# Pembahasan

# Kesimpulan

# Daftar Pustaka

[1] A. Penulis, Judul Referensi. Kota: Penerbit; 2024.
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_3_3_3_3,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'vancouver',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Praktikum', level: 1, required: true },
				{ heading: 'Tujuan', level: 1, required: true },
				{ heading: 'Dasar Teori', level: 1, required: true },
				{ heading: 'Alat dan Bahan', level: 1, required: true },
				{ heading: 'Prosedur', level: 1, required: true },
				{ heading: 'Data Pengamatan', level: 1, required: true, hint: 'Berbentuk tabel' },
				{ heading: 'Pembahasan', level: 1, required: true },
				{ heading: 'Kesimpulan', level: 1, required: true },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian lab report (laporan praktikum).',
				'Write in formal Indonesian (bahasa baku); report observations objectively.',
				'Cite sources in Vancouver style: numbered in order of appearance, e.g. [1].',
				'Keep Data Pengamatan as a table; never fold measurements into prose.',
				'Kesimpulan must answer each point stated in Tujuan.',
			],
		},
	},
	{
		slug: 'makalah-kuliah',
		name: 'Makalah Kuliah',
		description: 'Kerangka makalah: sampul, pendahuluan, pembahasan, penutup, daftar pustaka APA 7.',
		category: 'academic_id',
		locale: 'id',
		position: 6,
		markdown: `# Judul Makalah

*Disusun untuk memenuhi tugas mata kuliah Nama Mata Kuliah*

**Nama Penyusun** - NIM 1234567890
Program Studi - Fakultas - Universitas
Tahun

# Kata Pengantar

# Pendahuluan

## Latar Belakang

## Rumusan Masalah

## Tujuan

# Pembahasan

# Penutup

## Simpulan

## Saran

# Daftar Pustaka
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_3_3_3_3,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Makalah', level: 1, required: true },
				{ heading: 'Kata Pengantar', level: 1, required: false },
				{ heading: 'Pendahuluan', level: 1, required: true },
				{ heading: 'Latar Belakang', level: 2, required: true },
				{ heading: 'Rumusan Masalah', level: 2, required: true },
				{ heading: 'Tujuan', level: 2, required: true },
				{ heading: 'Pembahasan', level: 1, required: true },
				{ heading: 'Penutup', level: 1, required: true },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian course paper (makalah) with unnumbered headings.',
				'Write in formal academic Indonesian (bahasa baku).',
				'Cite sources in APA 7th edition author-year style, e.g. (Santoso, 2023).',
				'Pembahasan must address every point in Rumusan Masalah.',
			],
		},
	},
	{
		slug: 'artikel-jurnal-nasional',
		name: 'Artikel Jurnal Nasional',
		description: 'Bentuk umum artikel jurnal Indonesia: abstrak dwibahasa dan sitasi APA 7.',
		category: 'academic_id',
		locale: 'id',
		position: 7,
		markdown: `# Judul Artikel

**Nama Penulis 1**, **Nama Penulis 2**
Afiliasi, Universitas
email@example.com

# Abstrak

*Abstrak bahasa Indonesia, 150-250 kata, satu paragraf.*

**Kata kunci:** kata kunci 1, kata kunci 2, kata kunci 3

# Abstract

*English abstract, 150-250 words, one paragraph.*

**Keywords:** keyword 1, keyword 2, keyword 3

# Pendahuluan

# Metode

# Hasil dan Pembahasan

# Simpulan

# Ucapan Terima Kasih

# Daftar Pustaka
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: MARGIN_2_5_2_5_2_5,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'plain',
				abstractWords: [150, 250],
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Artikel', level: 1, required: true },
				{ heading: 'Abstrak', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true },
				{ heading: 'Pendahuluan', level: 1, required: true },
				{ heading: 'Metode', level: 1, required: true },
				{ heading: 'Hasil dan Pembahasan', level: 1, required: true },
				{ heading: 'Simpulan', level: 1, required: true },
				{ heading: 'Ucapan Terima Kasih', level: 1, required: false },
				{ heading: 'Daftar Pustaka', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian national journal article in single-column layout.',
				'Write in formal academic Indonesian (bahasa baku).',
				'Cite sources in APA 7th edition author-year style, e.g. (Santoso, 2023).',
				'Both abstracts are one paragraph of 150-250 words, each followed by keywords.',
				'Ucapan Terima Kasih is optional; keep it to one short paragraph when present.',
			],
			caveats: ['Format tiap jurnal nasional berbeda - sesuaikan kerangka ini dengan pedoman jurnal tujuan.'],
		},
	},
]
