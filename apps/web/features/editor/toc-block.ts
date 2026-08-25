import { mergeAttributes, Node } from '@tiptap/core'
export const TOC_BLOCK = 'tocBlock'

export type TocListKind = 'isi' | 'gambar' | 'tabel'
export type TocStyle = 'plain' | 'dotted' | 'link'
export type TocTabLeader = 'none' | 'dots' | 'dashes' | 'line'

export interface TocBlockAttrs {
	style: TocStyle
	showPageNumbers: boolean
	tabLeader: TocTabLeader
	minLevel: number
	maxLevel: number
	indentPerLevel: number
	listKind: TocListKind
	snapshot: string
}
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
export const TOC_KIND_LABEL: Record<TocListKind, string> = {
	isi: 'Daftar isi',
	gambar: 'Daftar gambar',
	tabel: 'Daftar tabel',
}
