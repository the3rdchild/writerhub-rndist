import { mergeAttributes, Node } from '@tiptap/core'

/**
 * Blok daftar isi di dalam naskah (PRD EDITOR-AI-UPGRADE §A5).
 *
 * Berbeda dari panel TOC (yang sudah ada, cuma navigasi), node ini benar-benar
 * ada di dokumen, ikut tercetak dan terekspor. Isinya DIHASILKAN dari sumber
 * heading yang sama dengan kerangka (`use-outline`), bukan diketik - makanya
 * nodenya `atom`: tidak bisa disunting bebas, hanya disegarkan.
 *
 * Tiga jenis daftar, memanfaatkan `OutlineItem.kind` (A4):
 *  - 'isi'   : heading biasa (kind 'heading')
 *  - 'gambar': caption gambar (kind 'caption' level 7-9 yang dipakai penulis)
 *  - 'tabel' : caption tabel (sama, pilihan penulis)
 *
 * Nomor halaman dibaca dari keadaan paginasi (§A5.3); dimatikan pada pageless.
 */

export const TOC_BLOCK = 'tocBlock'

export type TocListKind = 'isi' | 'gambar' | 'tabel'
export type TocStyle = 'plain' | 'dotted' | 'link'
export type TocTabLeader = 'none' | 'dots' | 'dashes' | 'line'

export interface TocBlockAttrs {
	style: TocStyle
	showPageNumbers: boolean
	tabLeader: TocTabLeader
	/** Rentang tingkat heading yang ikut. */
	minLevel: number
	maxLevel: number
	/** Lekukan per tingkat, piksel 96 dpi (disimpan piksel, ditampilkan cm/in). */
	indentPerLevel: number
	/** Jenis daftar: isi (heading) atau caption gambar/tabel. */
	listKind: TocListKind
	/** Potret teks terakhir (untuk cetak/ekspor), bukan sumber kebenaran. */
	snapshot: string
}

/** Bawaan §A5.2. indentPerLevel 0,5 cm ≈ 19 px pada 96 dpi. */
export const DEFAULT_TOC_ATTRS: TocBlockAttrs = {
	style: 'dotted',
	showPageNumbers: true,
	tabLeader: 'dots',
	minLevel: 1,
	maxLevel: 3,
	indentPerLevel: 19,
	listKind: 'isi',
	snapshot: '',
}

function clampedAttrs(attrs: Partial<TocBlockAttrs>): TocBlockAttrs {
	return {
		...DEFAULT_TOC_ATTRS,
		...attrs,
		minLevel: Math.max(1, Math.min(9, Number(attrs.minLevel ?? DEFAULT_TOC_ATTRS.minLevel))),
		maxLevel: Math.max(1, Math.min(9, Number(attrs.maxLevel ?? DEFAULT_TOC_ATTRS.maxLevel))),
	}
}

export const TocBlock = Node.create({
	name: TOC_BLOCK,
	group: 'block',
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			style: { default: DEFAULT_TOC_ATTRS.style },
			showPageNumbers: { default: DEFAULT_TOC_ATTRS.showPageNumbers },
			tabLeader: { default: DEFAULT_TOC_ATTRS.tabLeader },
			minLevel: { default: DEFAULT_TOC_ATTRS.minLevel },
			maxLevel: { default: DEFAULT_TOC_ATTRS.maxLevel },
			indentPerLevel: { default: DEFAULT_TOC_ATTRS.indentPerLevel },
			listKind: { default: DEFAULT_TOC_ATTRS.listKind },
			// `snapshot` tidak dirender ke atribut HTML - ia hanya cadangan cetak.
			snapshot: { default: '', rendered: false },
		}
	},

	parseHTML() {
		return [{ tag: `div[data-type="${TOC_BLOCK}"]` }]
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-type': TOC_BLOCK })]
	},

	addCommands() {
		return {
			insertToc:
				(attrs?: Partial<TocBlockAttrs>) =>
				({ chain }) =>
					chain()
						.focus()
						.insertContent({ type: TOC_BLOCK, attrs: clampedAttrs(attrs ?? {}) })
						.run(),
		}
	},
})

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		tocBlock: {
			insertToc: (attrs?: Partial<TocBlockAttrs>) => ReturnType
		}
	}
}

/** Label ramah untuk tiap jenis daftar (menu Sisipkan + slash). */
export const TOC_KIND_LABEL: Record<TocListKind, string> = {
	isi: 'Daftar isi',
	gambar: 'Daftar gambar',
	tabel: 'Daftar tabel',
}
