import { describe, expect, test } from 'bun:test'
import { latexToMarkdown, looksLikeLatexDocument } from './latex-document'

const DOCUMENT = String.raw`\documentclass{article}
\usepackage[bahasa]{babel}
\begin{document}
\title{Analisis Program}
\maketitle

\section{Pendahuluan}

Program ini menyasar 40--50 juta siswa.

\begin{table}[h!]
\centering
\begin{tabular}{|l|c|l|}
\hline
\textbf{Komponen} & \textbf{Estimasi} & \textbf{Keterangan} \\
\hline
Biaya makanan per anak & Rp15.000--Rp20.000/hari & Menu bergizi seimbang \\
Jumlah sasaran & 40--50 juta siswa & PAUD hingga SMA/SMK \\
\hline
\end{tabular}
\caption{Estimasi anggaran}
\end{table}

\section{Kesimpulan}

Distribusi \& logistik perlu 15--20\% dari total.
\end{document}`

describe('mengenali dokumen LaTeX', () => {
	test('dokumen utuh dikenali', () => {
		expect(looksLikeLatexDocument(DOCUMENT)).toBe(true)
	})

	test('rumus biasa bukan dokumen', () => {
		expect(looksLikeLatexDocument('Nilai $x^2$ naik.')).toBe(false)
	})
})

describe('menerjemahkan isinya', () => {
	const markdown = latexToMarkdown(DOCUMENT)

	test('section jadi heading', () => {
		expect(markdown).toContain('## Pendahuluan')
		expect(markdown).toContain('## Kesimpulan')
	})

	test('tabular jadi tabel Markdown, bukan teks ber-&', () => {
		expect(markdown).toContain('| **Komponen** | **Estimasi** | **Keterangan** |')
		expect(markdown).toContain('| --- | --- | --- |')
		expect(markdown).toContain('| Biaya makanan per anak |')
	})

	test('tidak ada sisa sintaks LaTeX yang bocor', () => {
		expect(markdown).not.toContain('\\\\')
		expect(markdown).not.toContain('\\hline')
		expect(markdown).not.toContain('\\documentclass')
		expect(markdown).not.toContain('\\begin{')
	})

	test('karakter ter-escape dikembalikan', () => {
		expect(markdown).toContain('Distribusi & logistik')
		expect(markdown).toContain('20% dari total')
	})

	test('tanda hubung ganda jadi en dash', () => {
		expect(markdown).toContain('40–50 juta siswa')
	})
})
