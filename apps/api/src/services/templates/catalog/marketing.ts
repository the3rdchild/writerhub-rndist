import type { BuiltinTemplateDefinition } from './definition'

/** Margin seragam 1 cm untuk flyer A5. */
const MARGIN_1 = { top: 38, right: 38, bottom: 38, left: 38 }

/** Margin seragam 1,5 cm untuk flyer A4 dan one-pager. */
const MARGIN_1_5 = { top: 57, right: 57, bottom: 57, left: 57 }

/** Margin seragam 2 cm untuk poster, newsletter, dan company profile. */
const MARGIN_2 = { top: 76, right: 76, bottom: 76, left: 76 }

/** Margin seragam 2,5 cm untuk press release. */
const MARGIN_2_5 = { top: 94, right: 94, bottom: 94, left: 94 }

const ARIAL_12 = { family: 'Arial, Helvetica, sans-serif', sizePt: 12 }

export const MARKETING_TEMPLATES: BuiltinTemplateDefinition[] = [
	{
		slug: 'flyer-a5',
		name: 'Flyer A5',
		description: 'Flyer A5 potret: headline, tiga manfaat, ajakan bertindak, dan kontak.',
		category: 'marketing',
		locale: 'id',
		position: 0,
		markdown: `# Headline Utama

## Subheadline Pendukung

## 3 Manfaat

1. Manfaat pertama
2. Manfaat kedua
3. Manfaat ketiga

## Ajakan Bertindak

## Kontak
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a5',
					orientation: 'portrait',
					margins: MARGIN_1,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_12,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Headline Utama', level: 1, required: true },
				{ heading: 'Subheadline Pendukung', level: 2, required: true },
				{ heading: '3 Manfaat', level: 2, required: true },
				{ heading: 'Ajakan Bertindak', level: 2, required: true },
				{ heading: 'Kontak', level: 2, required: true },
			],
			aiRules: [
				'This document is an Indonesian A5 flyer; every word competes for attention.',
				'Write short, punchy copy; no paragraph longer than two sentences.',
				'Keep exactly three benefits, phrased as outcomes for the reader.',
				'End with a single clear call to action and reachable contact details.',
			],
		},
	},
	{
		slug: 'flyer-a4',
		name: 'Flyer A4',
		description: 'Flyer A4 potret dengan ruang untuk visual utama yang besar.',
		category: 'marketing',
		locale: 'id',
		position: 1,
		markdown: `# Headline Utama

## Subheadline Pendukung

## Visual Utama

*Sisipkan gambar utama di sini.*

## 3 Manfaat

1. Manfaat pertama
2. Manfaat kedua
3. Manfaat ketiga

## Ajakan Bertindak

## Kontak
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
				baseFont: ARIAL_12,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Headline Utama', level: 1, required: true },
				{ heading: 'Subheadline Pendukung', level: 2, required: true },
				{ heading: 'Visual Utama', level: 2, required: false, hint: 'Ruang gambar besar' },
				{ heading: '3 Manfaat', level: 2, required: true },
				{ heading: 'Ajakan Bertindak', level: 2, required: true },
				{ heading: 'Kontak', level: 2, required: true },
			],
			aiRules: [
				'This document is an Indonesian A4 flyer with room for a large visual.',
				'Write short, punchy copy; let the main visual carry the page.',
				'Keep exactly three benefits, phrased as outcomes for the reader.',
				'End with a single clear call to action and reachable contact details.',
			],
		},
	},
	{
		slug: 'brosur-lipat-tiga',
		name: 'Brosur Lipat Tiga',
		description: 'Brosur A4 lanskap tiga kolom: sampul, masalah-solusi, paket harga, kontak.',
		category: 'marketing',
		locale: 'id',
		position: 2,
		markdown: `# Sampul

*Judul brosur dan tagline di panel sampul.*

# Masalah

# Solusi

# Paket Harga

| Paket | Isi | Harga |
|---|---|---|
| Dasar | | |
| Lengkap | | |

# Kontak

# Penutup
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'landscape',
					margins: MARGIN_1_5,
					pageColor: null,
					pageless: false,
				},
				columns: { count: 3, gap: 38 },
				baseFont: ARIAL_12,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Sampul', level: 1, required: true },
				{ heading: 'Masalah', level: 1, required: true },
				{ heading: 'Solusi', level: 1, required: true },
				{ heading: 'Paket Harga', level: 1, required: true, hint: 'Berbentuk tabel' },
				{ heading: 'Kontak', level: 1, required: true },
				{ heading: 'Penutup', level: 1, required: false },
			],
			aiRules: [
				'This document is an Indonesian tri-fold brochure on landscape A4 with three columns.',
				'Write short copy per panel; each column holds one message, not an essay.',
				'Keep Paket Harga as a table.',
				'Match the Sampul, Kontak, and Penutup panels to the outer side of the fold.',
			],
			caveats: [
				'Lipatan hanya diwakili tiga kolom - atur urutan panel sampul, kontak, dan penutup secara manual saat mencetak.',
			],
		},
	},
	{
		slug: 'poster-a3',
		name: 'Poster A3',
		description: 'Poster acara A3 potret: judul besar, visual, detail acara, dan kontak.',
		category: 'marketing',
		locale: 'id',
		position: 3,
		markdown: `# Judul Acara Besar

## Visual Utama

*Sisipkan visual utama di sini.*

## Detail Acara

**Hari/Tanggal:** 
**Waktu:** 
**Tempat:** 
**HTM:** 

## Kontak dan QR
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a3',
					orientation: 'portrait',
					margins: MARGIN_2,
					pageColor: null,
					pageless: false,
				},
				baseFont: ARIAL_12,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Acara Besar', level: 1, required: true },
				{ heading: 'Visual Utama', level: 2, required: true },
				{ heading: 'Detail Acara', level: 2, required: true },
				{ heading: 'Kontak dan QR', level: 2, required: true },
			],
			aiRules: [
				'This document is an Indonesian A3 event poster.',
				'Write for reading at a distance: big claims, few words.',
				'Detail Acara always answers when, where, and how much.',
				'Keep one contact channel and one QR placeholder, not a list of everything.',
			],
		},
	},
	{
		slug: 'one-pager-produk',
		name: 'One-Pager Produk',
		description: 'Satu halaman dua kolom: ringkasan produk, fitur, tabel spesifikasi, harga, CTA.',
		category: 'marketing',
		locale: 'id',
		position: 4,
		markdown: `# Nama Produk

*Tagline satu baris.*

## Ringkasan

## Fitur Utama

1. Fitur pertama
2. Fitur kedua
3. Fitur ketiga

## Spesifikasi

| Atribut | Nilai |
|---|---|
| | |

## Harga

## Ajakan Bertindak
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
				columns: { count: 2, gap: 19 },
				baseFont: ARIAL_12,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Nama Produk', level: 1, required: true },
				{ heading: 'Ringkasan', level: 2, required: true },
				{ heading: 'Fitur Utama', level: 2, required: true },
				{ heading: 'Spesifikasi', level: 2, required: true, hint: 'Berbentuk tabel' },
				{ heading: 'Harga', level: 2, required: true },
				{ heading: 'Ajakan Bertindak', level: 2, required: true },
			],
			aiRules: [
				'This document is an Indonesian two-column product one-pager; everything fits one page.',
				'Write benefit-led copy: features serve the benefit, not the reverse.',
				'Keep Spesifikasi as a table.',
				'End with one call to action; never two competing ones.',
			],
		},
	},
	{
		slug: 'newsletter',
		name: 'Newsletter',
		description: 'Buletin dua kolom dengan edisi dan tanggal di header halaman.',
		category: 'marketing',
		locale: 'id',
		position: 5,
		markdown: `# Artikel Utama

## Berita Singkat

### Berita 1

### Berita 2

## Agenda
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
				furniture: {
					header: {
						default: { text: 'NAMA TERBITAN | Edisi 001 | Tanggal Terbit', align: 'center' },
					},
				},
				columns: { count: 2, gap: 38 },
				baseFont: ARIAL_12,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Artikel Utama', level: 1, required: true },
				{ heading: 'Berita Singkat', level: 2, required: true },
				{ heading: 'Agenda', level: 2, required: true },
			],
			aiRules: [
				'This document is an Indonesian two-column newsletter; edition and date live in the page header.',
				'The main article may run long; Berita Singkat items stay under three sentences each.',
				'Agenda lists upcoming events with dates.',
				'Write in a warm but professional tone.',
			],
		},
	},
	{
		slug: 'press-release',
		name: 'Press Release',
		description: 'Siaran pers satu kolom spasi 1,5 dengan kutipan narasumber dan boilerplate.',
		category: 'marketing',
		locale: 'id',
		position: 6,
		markdown: `**UNTUK SIARAN SEGERA**

# Judul Siaran Pers

**Kota, Tanggal** - *Paragraf pembuka memuat inti berita: siapa, apa, kapan, di mana, mengapa.*

# Isi

# Kutipan Narasumber

*"Kutipan dari narasumber resmi."* - Nama, Jabatan

# Tentang Perusahaan

*Boilerplate singkat tentang perusahaan.*

# Kontak Media

**Nama:** 
**Email:** 
**Telepon:** 
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
				baseFont: ARIAL_12,
				lineHeight: 1.5,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Judul Siaran Pers', level: 1, required: true },
				{ heading: 'Isi', level: 1, required: true },
				{ heading: 'Kutipan Narasumber', level: 1, required: true },
				{ heading: 'Tentang Perusahaan', level: 1, required: true, hint: 'Boilerplate' },
				{ heading: 'Kontak Media', level: 1, required: true },
			],
			aiRules: [
				'This document is an Indonesian press release.',
				'Write the lead paragraph to answer who, what, when, where, and why.',
				'Keep "UNTUK SIARAN SEGERA" at the very top.',
				'Attribute quotes to a named spokesperson with their title.',
				'Keep the Tentang Perusahaan boilerplate identical across releases.',
			],
		},
	},
	{
		slug: 'company-profile',
		name: 'Company Profile Ringkas',
		description: 'Profil perusahaan ringkas: tentang kami, visi-misi, layanan, klien, kontak.',
		category: 'marketing',
		locale: 'id',
		position: 7,
		markdown: `# Nama Perusahaan

*Tagline satu baris.*

# Tentang Kami

# Visi dan Misi

## Visi

## Misi

# Layanan

# Klien

# Kontak
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
				baseFont: ARIAL_12,
			},
			format: {
				citationStyle: 'none',
				headingScheme: 'plain',
				language: 'id',
			},
			structure: [
				{ heading: 'Nama Perusahaan', level: 1, required: true },
				{ heading: 'Tentang Kami', level: 1, required: true },
				{ heading: 'Visi dan Misi', level: 1, required: true },
				{ heading: 'Layanan', level: 1, required: true },
				{ heading: 'Klien', level: 1, required: false },
				{ heading: 'Kontak', level: 1, required: true },
			],
			aiRules: [
				'This document is a concise Indonesian company profile.',
				'Write confidently about the company without superlatives you cannot back.',
				'Keep Misi as a short numbered list under Visi.',
				'End with complete, current contact details.',
			],
		},
	},
]
