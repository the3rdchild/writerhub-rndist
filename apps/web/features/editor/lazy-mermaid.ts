import type Mermaid from 'mermaid'

let mermaidPromise: Promise<typeof Mermaid> | null = null

export function getMermaid(): Promise<typeof Mermaid> {
	if (!mermaidPromise) {
		mermaidPromise = import('mermaid').then((mod) => {
			mod.default.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				/*
				 * Gantt mengukur lebar dari wadah sementara milik `mermaid.render`
				 * (selebar layar), lalu diperkecil ke lebar blok: hasilnya 300×28 px
				 * dan tak terbaca - di layar, DOCX, maupun PDF (uji editor 2 Okt,
				 * OBJ-11). Lebar gambarnya dipatok seukuran kolom halaman.
				 */
				gantt: { useWidth: 640, barHeight: 22, barGap: 6, fontSize: 12, sectionFontSize: 12 },
			})
			return mod.default
		})
	}
	return mermaidPromise
}
