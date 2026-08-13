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
import { CandidatePreviewHighlight } from '@/features/analysis/candidate-preview'
import { SuggestionHighlight } from '@/features/document/suggestion-highlight'
import { BlockSpacing } from '@/features/editor/block-spacing'
import { Callout } from '@/features/editor/callout'
import { CodeBlock } from '@/features/editor/code-block'
import { ColumnExtension } from '@/features/editor/columns'
import { CustomTableCell, CustomTableHeader } from '@/features/editor/custom-table'
import { TrailingParagraph } from '@/features/editor/editor-polish'
import { Footnote, FootnoteRef } from '@/features/editor/footnote'
import { HeadingLevels } from '@/features/editor/heading-extension'
import { BlockIndentExtension } from '@/features/editor/indent'
import { promptForLink } from '@/features/editor/link'
import { MathBlock, MathInline } from '@/features/editor/math'
import { PageBreak } from '@/features/editor/page-break'
import { SectionBreak } from '@/features/editor/section-break'
import { type PageGeometry, pageGeometry, type PageSetup, type SheetGeometry } from '@/features/editor/page-geometry'
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

/**
 * Daftar ekstensi editor, di satu tempat.
 *
 * Dipisah dari komponennya karena skema dokumen dipakai di luar layar juga:
 * migrasi naskah lama membangun editor sementara untuk membaca HTML tersimpan,
 * dan skemanya harus sama persis dengan yang dipakai editor sungguhan - node
 * yang tidak dikenal akan dibuang diam-diam saat naskah dibaca.
 */
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
	/** Setelan halaman dasar; mengaktifkan model section (§P8&P9). */
	setup?: PageSetup
	onPageCountChange?: (pageCount: number) => void
	/** Daftar lembar berubah (geometri tak seragam); dibaca kanvas. */
	onSheetsChange?: (sheets: SheetGeometry[]) => void
	onSectionsChange?: (setups: PageSetup[]) => void
	/**
	 * Ikatan ke Y.Doc. Diisi editor sungguhan; dibiarkan kosong oleh editor
	 * sementara yang hanya perlu skemanya.
	 */
	collaboration?: { document: Y.Doc; field: string } | null
	/**
	 * Menu slash ("/"). Hanya diberikan editor sungguhan - editor sementara
	 * (migrasi naskah) tidak membutuhkan UI interaktif.
	 */
	slashCommand?: Pick<SlashCommandOptions, 'onOpen' | 'onUpdate' | 'onClose'>
} = {}): Extensions {
	return [
		// Riwayat undo bawaan dimatikan saat naskah dipegang Yjs: keduanya
		// mencatat pembatalan sendiri-sendiri, dan dua pencatat pada satu naskah
		// membuat Ctrl+Z memutar balik perubahan yang bukan milik penekannya.
		// codeBlock bawaan dimatikan: digantikan CodeBlock dengan lowlight
		// (pewarnaan sintaks) di bawah. heading bawaan dimatikan juga, digantikan
		// HeadingLevels yang menerima sampai 9 tingkat (§A4).
		StarterKit.configure({
			link: false,
			codeBlock: false,
			heading: false,
			undoRedo: collaboration ? false : undefined,
		}),
		// Heading sampai 9 tingkat; tingkat 7–9 dirender sebagai div berperan heading
		// karena HTML hanya punya h1–h6 (§A4).
		HeadingLevels,
		// Ctrl+K memakai alur yang sama persis dengan tombol tautan di toolbar.
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
		// Spasi baris diurus BlockSpacing, yang menaruhnya pada bloknya alih-alih
		// pada mark - lihat block-spacing.ts. Dua tempat untuk satu nilai hanya
		// membuat keduanya saling menimpa.
		TextStyleKit.configure({ lineHeight: false }),
		Highlight.configure({ multicolor: true }),
		Subscript,
		Superscript,
		Typography,
		// TableKit memakai sel & kepala kustom (warna latar/bingkai); kedua node
		// bawaan dimatikan lalu digantikan CustomTableCell/CustomTableHeader di
		// bawah, persis seperti demo resmi Tiptap.
		TableKit.configure({ table: { resizable: true }, tableCell: false, tableHeader: false }),
		CustomTableCell,
		CustomTableHeader,
		// Menggeser tabel sesuai `indentLeft`. Harus lewat dekorasi karena
		// `resizable: true` menyerahkan penggambaran tabel ke node view bawaan
		// prosemirror-tables - lihat catatan di modulnya.
		TableIndent,
		TaskList,
		TaskItem.configure({ nested: true }),
		// Gambar dengan handle ubah-ukuran; menggantikan Image polos. Input rule
		// `![alt](url)` dari versi sebelumnya ikut di dalamnya.
		ResizableImage.configure({ inline: false, allowBase64: true } satisfies ResizableImageOptions),
		// Blok kode dengan pewarnaan sintaks lowlight. Bahasa dipilih lewat
		// slash command / toolbar.
		CodeBlock,
		// Blok catatan/seruan, catatan kaki, dan layout multi-kolom.
		Callout,
		Footnote,
		FootnoteRef,
		ColumnExtension,
		// Daftar isi otomatis (data di storage; dibaca panel TOC).
		TableOfContentsConfigured,
		Placeholder.configure({ placeholder: 'Mulai menulis, atau tempel draf Anda di sini…' }),
		SuggestionHighlight,
		// Pratinjau kandidat AI Rewriter; menganggur sampai panel mengirim meta.
		CandidatePreviewHighlight,
		// Sorotan rentang hasil analisis (Humanizer, Translator, AI Detector).
		AnalysisHighlight,
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
		// Cari & ganti; dekorasi menyorot kecocokan, perintah menggerakkan indeks.
		SearchAndReplace,
		TrailingParagraph,
		TocBlock.extend({ addNodeView: () => TocBlockNodeView }),
		Pagination.configure({ geometry, setup, onPageCountChange, onSheetsChange, onSectionsChange }),
		// Menu slash hanya untuk editor sungguhan.
		...(slashCommand
			? [SlashCommand.configure({ onOpen: slashCommand.onOpen, onUpdate: slashCommand.onUpdate, onClose: slashCommand.onClose })]
			: []),
		...(collaboration
			? [Collaboration.configure({ document: collaboration.document, field: collaboration.field })]
			: []),
	]
}
