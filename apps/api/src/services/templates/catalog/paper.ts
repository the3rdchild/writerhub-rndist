import type { BuiltinTemplateDefinition } from './definition'

/** Margin IEEE conference: atas 1,9 cm, bawah 2,54 cm, kiri-kanan 1,59 cm. */
const IEEE_MARGINS = { top: 72, right: 60, bottom: 96, left: 60 }

/** Margin ACM sigconf: atas-bawah 1 inci, kiri-kanan 0,75 inci. */
const ACM_MARGINS = { top: 96, right: 72, bottom: 96, left: 72 }

/** Margin Springer LNCS: kiri-kanan lebar 4 cm, atas-bawah 3 cm. */
const LNCS_MARGINS = { top: 113, right: 151, bottom: 113, left: 151 }

/** Margin 1 inci di keempat sisi (APA 7, manuskrip Elsevier). */
const INCH_MARGINS = { top: 96, right: 96, bottom: 96, left: 96 }

const TIMES_9 = { family: '"Times New Roman", Times, serif', sizePt: 9 }
const TIMES_10 = { family: '"Times New Roman", Times, serif', sizePt: 10 }
const TIMES_12 = { family: '"Times New Roman", Times, serif', sizePt: 12 }

export const PAPER_TEMPLATES: BuiltinTemplateDefinition[] = [
	{
		slug: 'ieee-conference',
		name: 'IEEE Conference',
		description: 'Paper konferensi dua kolom dengan sitasi bernomor [1] dan Index Terms.',
		category: 'paper',
		locale: 'en',
		position: 0,
		columnsBeforeHeading: 'I. Introduction',
		markdown: `# Paper Title

**First Author**, **Second Author**
Department, University
email@example.com

**Abstract** - *One paragraph of 150-250 words summarizing the problem, approach, and key results.*

**Index Terms** - keyword 1, keyword 2, keyword 3

# I. Introduction

# II. Related Work

# III. Method

# IV. Results

# V. Conclusion

# References

[1] A. Author and B. Author, "Title of paper," in *Proc. Conf.*, 2024, pp. 1-5.
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'letter',
					orientation: 'portrait',
					margins: IEEE_MARGINS,
					pageColor: null,
					pageless: false,
				},
				columns: { count: 2, gap: 19 },
				baseFont: TIMES_10,
			},
			format: {
				citationStyle: 'ieee',
				headingScheme: 'roman-section',
				abstractWords: [150, 250],
				language: 'en',
			},
			structure: [
				{ heading: 'Paper Title', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true, hint: 'Satu paragraf 150-250 kata' },
				{ heading: 'I. Introduction', level: 1, required: true },
				{ heading: 'II. Related Work', level: 1, required: false },
				{ heading: 'III. Method', level: 1, required: true },
				{ heading: 'IV. Results', level: 1, required: true },
				{ heading: 'V. Conclusion', level: 1, required: true },
				{ heading: 'References', level: 1, required: true },
			],
			aiRules: [
				'This document follows the IEEE conference format: two columns, 10pt body.',
				'Number top-level sections with Roman numerals (I. INTRODUCTION), subsections with A., B.',
				'Cite as bracketed numbers in order of first appearance: [1], [2]. Never use author-year.',
				'The reference list is numbered in citation order, not alphabetical.',
				'Keep the abstract to one paragraph of 150-250 words, followed by Index Terms.',
			],
		},
	},
	{
		slug: 'ieee-journal',
		name: 'IEEE Journal (Transactions)',
		description: 'Versi jurnal dari format IEEE: dua kolom dengan Nomenclature, Appendix, dan Biography.',
		category: 'paper',
		locale: 'en',
		position: 1,
		columnsBeforeHeading: 'Nomenclature',
		markdown: `# Paper Title

**First Author**, **Second Author**
Department, University
email@example.com

**Abstract** - *One paragraph of 150-250 words summarizing the problem, approach, and key results.*

**Index Terms** - keyword 1, keyword 2, keyword 3

# Nomenclature

*List the symbols and abbreviations used throughout the paper.*

# I. Introduction

# II. Related Work

# III. Proposed Method

# IV. Experimental Results

# V. Conclusion

# Appendix

# References

[1] A. Author and B. Author, "Title of article," *IEEE Trans. Name*, vol. 1, no. 1, pp. 1-10, 2024.

# Biography

**First Author** received the B.Sc. degree from ...
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'letter',
					orientation: 'portrait',
					margins: IEEE_MARGINS,
					pageColor: null,
					pageless: false,
				},
				columns: { count: 2, gap: 19 },
				baseFont: TIMES_10,
			},
			format: {
				citationStyle: 'ieee',
				headingScheme: 'roman-section',
				abstractWords: [150, 250],
				language: 'en',
			},
			structure: [
				{ heading: 'Paper Title', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true, hint: 'Satu paragraf 150-250 kata' },
				{ heading: 'Nomenclature', level: 1, required: false },
				{ heading: 'I. Introduction', level: 1, required: true },
				{ heading: 'II. Related Work', level: 1, required: false },
				{ heading: 'III. Proposed Method', level: 1, required: true },
				{ heading: 'IV. Experimental Results', level: 1, required: true },
				{ heading: 'V. Conclusion', level: 1, required: true },
				{ heading: 'Appendix', level: 1, required: false },
				{ heading: 'References', level: 1, required: true },
				{ heading: 'Biography', level: 1, required: false },
			],
			aiRules: [
				'This document follows the IEEE journal (Transactions) format: two columns, 10pt body.',
				'Number top-level sections with Roman numerals (I. INTRODUCTION), subsections with A., B.',
				'Cite as bracketed numbers in order of first appearance: [1], [2]. Never use author-year.',
				'The reference list is numbered in citation order, not alphabetical.',
				'Keep the abstract to one paragraph of 150-250 words, followed by Index Terms.',
				'Nomenclature, Appendix, and Biography are optional; keep them in this order when present.',
			],
		},
	},
	{
		slug: 'apa7-student',
		name: 'APA 7 - Student Paper',
		description: 'Paper mahasiswa format APA 7: halaman judul, abstrak, spasi ganda, margin 1 inci.',
		category: 'paper',
		locale: 'en',
		position: 2,
		markdown: `# Title of the Paper

Student Name
Department, University
Course Code: Course Name
Instructor Name
Month Day, Year

# Abstract

*One paragraph, no indentation, up to 250 words.*

**Keywords:** keyword 1, keyword 2, keyword 3

# Title of the Paper

*Repeat the paper title in bold at the top of the body; the text begins here.*

# References

Author, A. A. (2024). *Title of the work*. Publisher.
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'letter',
					orientation: 'portrait',
					margins: INCH_MARGINS,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 2,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'plain',
				abstractWords: [150, 250],
				language: 'en',
			},
			structure: [
				{ heading: 'Title of the Paper', level: 1, required: true, hint: 'Halaman judul' },
				{ heading: 'Abstract', level: 1, required: true },
				{ heading: 'References', level: 1, required: true },
			],
			aiRules: [
				'This document follows APA 7th edition student paper format: double-spaced, 12pt Times New Roman, 1-inch margins.',
				'Headings are unnumbered; use up to five APA heading levels, starting at Level 1 (centered, bold).',
				'Cite in author-year style, e.g. (Santoso, 2023) or Santoso (2023).',
				'The reference list is alphabetical by first author surname.',
				'The title page lists title, author, affiliation, course, instructor, and due date.',
			],
			caveats: ['Hanging indent pada daftar pustaka belum otomatis - atur indent baris kedua secara manual.'],
		},
	},
	{
		slug: 'apa7-professional',
		name: 'APA 7 - Professional Paper',
		description: 'Paper profesional APA 7 dengan running head di header dan Author Note.',
		category: 'paper',
		locale: 'en',
		position: 3,
		markdown: `# Title of the Paper

Author Name
Department, University

# Author Note

*Correspondence, funding, and conflict-of-interest statements.*

# Abstract

*One paragraph, no indentation, up to 250 words.*

**Keywords:** keyword 1, keyword 2, keyword 3

# Title of the Paper

*Repeat the paper title in bold at the top of the body; the text begins here.*

# References

Author, A. A. (2024). *Title of the article*. *Journal Name, 12*(3), 1-20.
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'letter',
					orientation: 'portrait',
					margins: INCH_MARGINS,
					pageColor: null,
					pageless: false,
				},
				furniture: {
					header: {
						default: { text: 'SHORTENED TITLE', align: 'left' },
					},
				},
				baseFont: TIMES_12,
				lineHeight: 2,
			},
			format: {
				citationStyle: 'apa7',
				headingScheme: 'plain',
				abstractWords: [150, 250],
				language: 'en',
			},
			structure: [
				{ heading: 'Title of the Paper', level: 1, required: true, hint: 'Halaman judul' },
				{ heading: 'Author Note', level: 1, required: false },
				{ heading: 'Abstract', level: 1, required: true },
				{ heading: 'References', level: 1, required: true },
			],
			aiRules: [
				'This document follows APA 7th edition professional paper format: double-spaced, 12pt Times New Roman, 1-inch margins, with a running head in the page header.',
				'The running head is an all-caps shortened title, at most 50 characters, aligned left.',
				'Headings are unnumbered; use up to five APA heading levels, starting at Level 1 (centered, bold).',
				'Cite in author-year style, e.g. (Santoso, 2023) or Santoso (2023).',
				'The reference list is alphabetical by first author surname.',
			],
			caveats: ['Hanging indent pada daftar pustaka belum otomatis - atur indent baris kedua secara manual.'],
		},
	},
	{
		slug: 'acm-sigconf',
		name: 'ACM SIGCONF',
		description: 'Format ACM sigconf dua kolom 9pt dengan CCS Concepts dan referensi ACM Ref.',
		category: 'paper',
		locale: 'en',
		position: 4,
		columnsBeforeHeading: '1. Introduction',
		markdown: `# Paper Title

**First Author**
Department, University
email@example.com

**Second Author**
Department, University
email@example.com

**Abstract** - *One paragraph of 150-250 words summarizing the problem, approach, and key results.*

**CCS Concepts:** - *Category - Subcategory: Descriptor.*

**Keywords:** keyword 1, keyword 2, keyword 3

# 1. Introduction

# 2. Background

# 3. Approach

# 4. Evaluation

# 5. Conclusion

# References

[1] First Author and Second Author. 2024. Title of paper. In *Proceedings of Conference (Conf '24)*. ACM, 1-5.
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'letter',
					orientation: 'portrait',
					margins: ACM_MARGINS,
					pageColor: null,
					pageless: false,
				},
				columns: { count: 2, gap: 19 },
				baseFont: TIMES_9,
			},
			format: {
				citationStyle: 'acm',
				headingScheme: 'decimal',
				abstractWords: [150, 250],
				language: 'en',
			},
			structure: [
				{ heading: 'Paper Title', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true, hint: 'Satu paragraf 150-250 kata' },
				{ heading: '1. Introduction', level: 1, required: true },
				{ heading: '2. Background', level: 1, required: false },
				{ heading: '3. Approach', level: 1, required: true },
				{ heading: '4. Evaluation', level: 1, required: true },
				{ heading: '5. Conclusion', level: 1, required: true },
				{ heading: 'References', level: 1, required: true },
			],
			aiRules: [
				'This document follows the ACM sigconf format: two columns, 9pt body.',
				'Number top-level sections with decimals (1. INTRODUCTION), subsections with 1.1, 1.2.',
				'Cite as bracketed numbers in order of first appearance: [1], [2].',
				'The reference list uses the ACM Reference Format with year after authors.',
				'Keep the abstract to one paragraph of 150-250 words, followed by CCS Concepts and Keywords.',
			],
		},
	},
	{
		slug: 'springer-lncs',
		name: 'Springer LNCS',
		description: 'Kerangka LNCS satu kolom dengan margin lebar, kata kunci, dan referensi bernomor.',
		category: 'paper',
		locale: 'en',
		position: 5,
		markdown: `# Paper Title

**First Author** 1, **Second Author** 2
1 Department, University
2 Institute, City, Country
email@example.com

**Abstract.** *One paragraph of 150-250 words summarizing the contribution.*

**Keywords:** keyword 1 · keyword 2 · keyword 3

# 1. Introduction

# 2. Related Work

# 3. Method

# 4. Experiments and Results

# 5. Conclusion

# References

1. Author, A., Author, B.: Title of paper. In: Proceedings of Conference, pp. 1-10. Publisher, City (2024)
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: LNCS_MARGINS,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_10,
			},
			format: {
				citationStyle: 'vancouver',
				headingScheme: 'decimal',
				abstractWords: [150, 250],
				language: 'en',
			},
			structure: [
				{ heading: 'Paper Title', level: 1, required: true },
				{ heading: '1. Introduction', level: 1, required: true },
				{ heading: '2. Related Work', level: 1, required: false },
				{ heading: '3. Method', level: 1, required: true },
				{ heading: '4. Experiments and Results', level: 1, required: true },
				{ heading: '5. Conclusion', level: 1, required: true },
				{ heading: 'References', level: 1, required: true },
			],
			aiRules: [
				'This document follows the Springer LNCS format: single column, wide margins, numbered sections.',
				'Number top-level sections with decimals (1. Introduction), subsections with 1.1, 1.2.',
				'Cite as bracketed numbers in order of first appearance: [1], [2].',
				'The abstract is one paragraph of 150-250 words, followed by 3-5 keywords.',
				'The reference list is numbered in citation order with the LNCS author-initial style.',
			],
		},
	},
	{
		slug: 'elsevier-manuscript',
		name: 'Manuskrip Jurnal (Elsevier)',
		description: 'Manuskrip Elsevier satu kolom spasi ganda dengan title page, highlights, dan sitasi Vancouver.',
		category: 'paper',
		locale: 'en',
		position: 6,
		markdown: `# Title Page

*Title, author names, affiliations, and corresponding author contact.*

# Highlights

- Highlight 1
- Highlight 2
- Highlight 3

# Abstract

*One paragraph, up to 250 words.*

**Keywords:** keyword 1; keyword 2; keyword 3

# 1. Introduction

# 2. Materials and Methods

# 3. Results

# 4. Discussion

# References

[1] A. Author, B. Author, Title of article, J. Name 12 (2024) 1-20.
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: INCH_MARGINS,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_12,
				lineHeight: 2,
			},
			format: {
				citationStyle: 'vancouver',
				headingScheme: 'decimal',
				abstractWords: [150, 250],
				language: 'en',
			},
			structure: [
				{ heading: 'Title Page', level: 1, required: true },
				{ heading: 'Highlights', level: 1, required: true, hint: '3-5 poin pendek' },
				{ heading: 'Abstract', level: 1, required: true },
				{ heading: '1. Introduction', level: 1, required: true },
				{ heading: '2. Materials and Methods', level: 1, required: true },
				{ heading: '3. Results', level: 1, required: true },
				{ heading: '4. Discussion', level: 1, required: true },
				{ heading: 'References', level: 1, required: true },
			],
			aiRules: [
				'This document is an Elsevier journal manuscript: single column, double-spaced, for peer review.',
				'Keep Results separate from Discussion: report findings first, interpret them second.',
				'Cite in Vancouver style: numbered in order of appearance, e.g. [1].',
				'The reference list is numbered in citation order.',
				'Highlights are 3-5 short bullet points describing the core findings.',
			],
			caveats: ['Nomor baris di margin belum tersedia - tambahkan manual bila diminta editor jurnal.'],
		},
	},
	{
		slug: 'extended-abstract',
		name: 'Extended Abstract',
		description: 'Abstrak panjang maksimal dua halaman: motivasi, pendekatan, dan hasil awal.',
		category: 'paper',
		locale: 'en',
		position: 7,
		markdown: `# Extended Abstract Title

**Author Name**
Department, University
email@example.com

# Abstract

*One short paragraph of 100-150 words.*

# Motivation

# Approach

# Preliminary Results

# References

[1] A. Author and B. Author, "Title of paper," in *Proc. Conf.*, 2024, pp. 1-5.
`,
		spec: {
			layout: {
				pageSetup: {
					size: 'a4',
					orientation: 'portrait',
					margins: INCH_MARGINS,
					pageColor: null,
					pageless: false,
				},
				baseFont: TIMES_10,
			},
			format: {
				citationStyle: 'ieee',
				headingScheme: 'plain',
				abstractWords: [100, 150],
				language: 'en',
			},
			structure: [
				{ heading: 'Extended Abstract Title', level: 1, required: true },
				{ heading: 'Abstract', level: 1, required: true, hint: 'Satu paragraf 100-150 kata' },
				{ heading: 'Motivation', level: 1, required: true },
				{ heading: 'Approach', level: 1, required: true },
				{ heading: 'Preliminary Results', level: 1, required: true },
				{ heading: 'References', level: 1, required: true },
			],
			aiRules: [
				'This document is an extended abstract of at most two pages.',
				'Keep every section short; depth belongs to the full paper, not here.',
				'Cite as bracketed numbers in order of first appearance: [1], [2].',
				'The abstract is one short paragraph of 100-150 words.',
			],
		},
	},
]
