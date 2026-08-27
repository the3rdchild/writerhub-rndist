'use client'

import Collaboration from '@tiptap/extension-collaboration'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Typography from '@tiptap/extension-typography'
import type { Extensions } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type * as Y from 'yjs'
import { CommentMark } from '@/features/comments/comment-mark'
import { AnalysisHighlight } from '@/features/analysis/analysis-highlight'
import { AnalysisDiffHighlight } from '@/features/analysis/analysis-diff-highlight'
import { CandidatePreviewHighlight } from '@/features/analysis/candidate-preview'
import { SuggestionHighlight } from '@/features/document/suggestion-highlight'
import { BlockSpacing } from '@/features/editor/block-spacing'
import { Callout } from '@/features/editor/callout'
import { CodeBlock } from '@/features/editor/code-block'
import { ColumnExtension } from '@/features/editor/columns'
import { CustomTableCell, CustomTableHeader } from '@/features/editor/custom-table'
import { TrailingParagraph } from '@/features/editor/trailing-paragraph'
import { Footnote, FootnoteRef } from '@/features/editor/footnote'
import { HeadingLevels } from '@/features/editor/heading-extension'
import { BlockIndentExtension } from '@/features/editor/indent'
import { promptForLink } from '@/features/editor/link'
import { MathBlock, MathInline } from '@/features/editor/math'
import { PageBreak } from '@/features/editor/page-break'
import { SectionBreak } from '@/features/editor/section-break'
import {
	type PageGeometry,
	pageGeometry,
	type PageSetup,
	type SheetGeometry,
} from '@/features/editor/page-geometry'
import { Pagination } from '@/features/editor/pagination'
import { TocBlock } from '@/features/editor/toc-block'
import { TocBlockNodeView } from '@/components/editor/toc-block-view'
import { PasteMarkdown } from '@/features/editor/paste-markdown'
import { type ResizableImageOptions, ResizableImage } from '@/features/editor/resizable-image'
import { SearchAndReplace } from '@/features/editor/search-replace'
import { SelectionHighlight } from '@/features/editor/selection-highlight'
import type { SlashCommandOptions, SlashCommandState } from '@/features/editor/slash-command'
import { SlashCommand } from '@/features/editor/slash-command'
import { TableHeaderRepeat } from '@/features/editor/table-header-repeat'
import { TableIndent } from '@/features/editor/table-indent'
import { TableOfContentsConfigured } from '@/features/editor/table-of-contents'
import { TextWeight } from '@/features/editor/text-weight'
import { shortcutKeys } from '@/features/shortcuts/registry'
export function buildEditorExtensions({
	geometry = pageGeometry(),
	setup,
	onPageCountChange,
	onSheetsChange,
	onSectionsChange,
	collaboration,
	slashCommand,
}: {
	geometry?: PageGeometry
	setup?: PageSetup
	onPageCountChange?: (pageCount: number) => void
	onSheetsChange?: (sheets: SheetGeometry[]) => void
	onSectionsChange?: (setups: PageSetup[]) => void
	collaboration?: { document: Y.Doc; field: string } | null
	slashCommand?: Pick<SlashCommandOptions, 'onOpen' | 'onUpdate' | 'onClose'>
} = {}): Extensions {
	return [
		StarterKit.configure({
			link: false,
			codeBlock: false,
			heading: false,
			undoRedo: collaboration ? false : undefined,
		}),
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
		}).configure({ openOnClick: false, autolink: true }),
		TextAlign.configure({ types: ['heading', 'paragraph'] }),
		TextStyleKit.configure({ lineHeight: false }),
		Highlight.configure({ multicolor: true }),
		Subscript,
		Superscript,
		Typography,
		TableKit.configure({ table: { resizable: true }, tableCell: false, tableHeader: false }),
		CustomTableCell,
		CustomTableHeader,
		TableIndent,
		TaskList,
		TaskItem.configure({ nested: true }),
		ResizableImage.configure({ inline: false, allowBase64: true } satisfies ResizableImageOptions),
		CodeBlock,
		Callout,
		Footnote,
		FootnoteRef,
		ColumnExtension,
		TableOfContentsConfigured,
		Placeholder.configure({ placeholder: 'Mulai menulis, atau tempel draf Anda di sini…' }),
		SuggestionHighlight,
		CandidatePreviewHighlight,
		AnalysisHighlight,
		AnalysisDiffHighlight,
		SelectionHighlight,
		BlockIndentExtension,
		BlockSpacing,
		TextWeight,
		PageBreak,
		SectionBreak,
		TableHeaderRepeat,
		CommentMark,
		MathInline,
		MathBlock,
		PasteMarkdown,
		SearchAndReplace,
		TrailingParagraph,
		TocBlock.extend({ addNodeView: () => TocBlockNodeView }),
		Pagination.configure({ geometry, setup, onPageCountChange, onSheetsChange, onSectionsChange }),
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
	]
}
