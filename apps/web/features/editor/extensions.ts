'use client'

import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration'
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Extensions } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type * as Y from 'yjs'
import { HtmlBlockNodeView } from '@/components/editor/html-block-view'
import { TocBlockNodeView } from '@/components/editor/toc-block-view'
import { AnalysisDiffHighlight } from '@/features/analysis/analysis-diff-highlight'
import { AnalysisHighlight } from '@/features/analysis/analysis-highlight'
import { CandidatePreviewHighlight } from '@/features/analysis/candidate-preview'
import { CommentMark } from '@/features/comments/comment-mark'
import { SuggestionHighlight } from '@/features/document/suggestion-highlight'
import { AutoTypography } from '@/features/editor/auto-typography'
import { BlockKeep } from '@/features/editor/block-keep'
import { BlockSpacing } from '@/features/editor/block-spacing'
import { Callout } from '@/features/editor/callout'
import { ClickPastNodeSelection } from '@/features/editor/click-past-node-selection'
import { CodeBlock } from '@/features/editor/code-block'
import { ColumnBreak } from '@/features/editor/column-break'
import { ColumnExtension } from '@/features/editor/columns'
import { EditShortcuts, KeepTabInEditor } from '@/features/editor/edit-shortcuts'
import { Footnote, FootnoteRef } from '@/features/editor/footnote'
import { HeadingLevels } from '@/features/editor/heading-extension'
import { HtmlBlock } from '@/features/editor/html-block'
import { ImageFileDrop } from '@/features/editor/image-insert'
import { BlockIndentExtension } from '@/features/editor/indent'
import { openHref, promptForLink } from '@/features/editor/link'
import { NumberedList } from '@/features/editor/list-numbering'
import { Bold, Code, Italic, Strike } from '@/features/editor/marks'
import { MathBlock, MathInline } from '@/features/editor/math'
import { PageBreak } from '@/features/editor/page-break'
import {
	type PageGeometry,
	type PageSetup,
	pageGeometry,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { Pagination } from '@/features/editor/pagination'
import { PasteMarkdown } from '@/features/editor/paste-markdown'
import { PasteWord } from '@/features/editor/paste-word'
import { ResizableImage, type ResizableImageOptions } from '@/features/editor/resizable-image'
import { SearchAndReplace } from '@/features/editor/search-replace'
import { SectionBreak } from '@/features/editor/section-break'
import { SelectionHighlight } from '@/features/editor/selection-highlight'
import type { SlashCommandOptions } from '@/features/editor/slash-command'
import { SlashCommand } from '@/features/editor/slash-command'
import { Tab } from '@/features/editor/tab-node'
import { TabStops } from '@/features/editor/tab-stops'
import { TableHeaderRepeat } from '@/features/editor/table-header-repeat'
import { TableIndent } from '@/features/editor/table-indent'
import { TableOfContentsConfigured } from '@/features/editor/table-of-contents'
import {
	TableCellProps,
	TableHeaderProps,
	TableNodeProps,
	TablePropsCommands,
	TableRowProps,
	TableViewClearingWidths,
} from '@/features/editor/table-props'
import { TextWeight } from '@/features/editor/text-weight'
import { TocBlock } from '@/features/editor/toc-block'
import { TrailingParagraph } from '@/features/editor/trailing-paragraph'
import { shortcutKeys } from '@/features/shortcuts/registry'

export function buildEditorExtensions({
	geometry = pageGeometry(),
	setup,
	onPageCountChange,
	onSheetsChange,
	onSectionsChange,
	breakBeforeLevels,
	collaboration,
	collaborationCaret,
	slashCommand,
	trailingParagraph = true,
}: {
	geometry?: PageGeometry
	setup?: PageSetup
	onPageCountChange?: (pageCount: number) => void
	onSheetsChange?: (sheets: SheetGeometry[]) => void
	onSectionsChange?: (setups: PageSetup[]) => void
	/** Tingkat judul yang selalu membuka lembar baru; dari tipografi dokumen. */
	breakBeforeLevels?: number[]
	collaboration?: { document: Y.Doc; field: string } | null
	/**
	 * Kursor dan nama kolaborator (SHL-5). Hanya untuk editor yang terikat ke
	 * Y.Doc tab kolaboratif; `provider` adalah provider y-websocket sesinya.
	 */
	collaborationCaret?: {
		provider: { awareness: unknown }
		user: { name: string; color: string }
	} | null
	slashCommand?: Pick<SlashCommandOptions, 'onOpen' | 'onUpdate' | 'onClose'>
	/**
	 * Paragraf kosong di ujung dokumen adalah kenyamanan MENYUNTING, bukan isi.
	 * Halaman ekspor mematikannya: editor di sana tidak bisa disunting, dan
	 * paragraf itu kembali ke `@page` bawaan sehingga peramban menambah satu
	 * lembar kosong setelah rancangan `page: flyer`.
	 */
	trailingParagraph?: boolean
} = {}): Extensions {
	return [
		StarterKit.configure({
			link: false,
			codeBlock: false,
			heading: false,
			/* Diganti NumberedList - gaya nomor yang terbaca CSS (`list-numbering.ts`). */
			orderedList: false,
			/* Diganti versi tanpa aturan tempel - lihat `marks.ts`. */
			bold: false,
			italic: false,
			strike: false,
			code: false,
			undoRedo: collaboration ? false : undefined,
		}),
		Bold,
		Italic,
		Strike,
		Code,
		NumberedList,
		HeadingLevels,
		Link.extend({
			addKeyboardShortcuts() {
				return {
					[shortcutKeys('text.link')]: () => {
						promptForLink(this.editor)
						return true
					},
				}
			},
			/* Ctrl/Cmd+klik membuka tautan di tab baru; klik biasa tetap menaruh
			 * kursor (gelembung tautan menawarkan Open/Edit/Remove) - TKS-11. */
			addProseMirrorPlugins() {
				return [
					...(this.parent?.() ?? []),
					new Plugin({
						key: new PluginKey('linkModClick'),
						props: {
							handleClick(view, pos, event) {
								if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false
								const marks = [
									...view.state.doc.resolve(pos).marks(),
									...(view.state.doc.nodeAt(pos)?.marks ?? []),
								]
								const href = marks.find((mark) => mark.type.name === 'link')?.attrs.href as string | undefined
								if (!href) return false
								openHref(href)
								return true
							},
						},
					}),
				]
			},
		}).configure({ openOnClick: false, autolink: true }),
		TextAlign.configure({ types: ['heading', 'paragraph'] }),
		TextStyleKit.configure({ lineHeight: false }),
		EditShortcuts,
		KeepTabInEditor,
		TabStops,
		Tab,
		Highlight.configure({ multicolor: true }),
		Subscript,
		Superscript,
		AutoTypography,
		TableKit.configure({ table: false, tableRow: false, tableCell: false, tableHeader: false }),
		TableNodeProps.configure({ resizable: true, View: TableViewClearingWidths }),
		TableRowProps,
		TableCellProps,
		TableHeaderProps,
		TablePropsCommands,
		TableIndent,
		TaskList,
		TaskItem.configure({ nested: true }),
		ResizableImage.configure({ inline: false, allowBase64: true } satisfies ResizableImageOptions),
		ImageFileDrop,
		CodeBlock,
		Callout,
		Footnote,
		FootnoteRef,
		ColumnExtension,
		TableOfContentsConfigured,
		Placeholder.configure({ placeholder: 'Start writing, or paste your draft here…' }),
		SuggestionHighlight,
		CandidatePreviewHighlight,
		AnalysisHighlight,
		AnalysisDiffHighlight,
		SelectionHighlight,
		ClickPastNodeSelection,
		BlockIndentExtension,
		BlockSpacing,
		BlockKeep,
		TextWeight,
		PageBreak,
		ColumnBreak,
		SectionBreak,
		TableHeaderRepeat,
		CommentMark,
		MathInline,
		MathBlock,
		PasteMarkdown,
		PasteWord,
		SearchAndReplace,
		// Paragraf penutup hanya untuk kanvas menyunting; halaman ekspor
		// mematikannya (`trailingParagraph: false`).
		...(trailingParagraph ? [collaborationCaret ? CollaborativeTrailingParagraph : TrailingParagraph] : []),
		TocBlock.extend({ addNodeView: () => TocBlockNodeView }),
		HtmlBlock.extend({ addNodeView: () => HtmlBlockNodeView }),
		Pagination.configure({
			geometry,
			setup,
			onPageCountChange,
			onSheetsChange,
			onSectionsChange,
			breakBeforeLevels,
		}),
		...(slashCommand
			? [
					SlashCommand.configure({
						onOpen: slashCommand.onOpen,
						onUpdate: slashCommand.onUpdate,
						onClose: slashCommand.onClose,
					}),
				]
			: []),
		...(collaboration
			? [Collaboration.configure({ document: collaboration.document, field: collaboration.field })]
			: []),
		...(collaborationCaret
			? [
					CollaborationCaret.configure({
						provider: collaborationCaret.provider,
						user: collaborationCaret.user,
						render: renderCollaboratorCaret,
					}),
				]
			: []),
	]
}

/**
 * Paragraf penutup versi kolaboratif: hanya menanggapi transaksi lokal. Tanpa
 * ini setiap klien yang menerima perubahan dari kolaborator ikut menambahkan
 * paragraf penutupnya sendiri - dan semuanya tergabung menjadi paragraf kosong
 * berderet di ujung naskah.
 */
const CollaborativeTrailingParagraph = TrailingParagraph.extend({
	addProseMirrorPlugins() {
		const [plugin] = this.parent?.() ?? []
		if (!plugin) return []
		const append = plugin.spec.appendTransaction
		const editor = this.editor
		return [
			new Plugin({
				key: new PluginKey('trailingParagraphCollab'),
				appendTransaction(transactions, oldState, newState) {
					// Viewer juga tidak: tulisannya dibuang server, dan salinannya jadi menyimpang.
					if (!editor.isEditable) return null
					if (transactions.some((transaction) => isChangeOrigin(transaction))) return null
					return append?.call(plugin, transactions, oldState, newState) ?? null
				},
			}),
		]
	},
})

/** Kursor kolaborator: garis berwarna dengan label nama (gaya di globals.css, bagian kolaborasi). */
function renderCollaboratorCaret(user: Record<string, unknown>): HTMLElement {
	const color = typeof user.color === 'string' ? user.color : '#888888'
	const caret = document.createElement('span')
	caret.classList.add('collaboration-carets__caret')
	caret.style.borderColor = color
	const label = document.createElement('div')
	label.classList.add('collaboration-carets__label')
	label.style.backgroundColor = color
	label.textContent = typeof user.name === 'string' && user.name ? user.name : 'Guest'
	caret.append(label)
	return caret
}
