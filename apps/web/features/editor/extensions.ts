'use client'

import Collaboration from '@tiptap/extension-collaboration'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Typography from '@tiptap/extension-typography'
import type { Extensions } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type * as Y from 'yjs'
import { CommentMark } from '@/features/comments/comment-mark'
import { CandidatePreviewHighlight } from '@/features/analysis/candidate-preview'
import { SuggestionHighlight } from '@/features/document/suggestion-highlight'
import { BlockSpacing } from '@/features/editor/block-spacing'
import { Callout } from '@/features/editor/callout'
import { CodeBlock } from '@/features/editor/code-block'
import { ColumnExtension } from '@/features/editor/columns'
import { TrailingParagraph } from '@/features/editor/editor-polish'
import { Footnote, FootnoteRef } from '@/features/editor/footnote'
import { BlockIndentExtension } from '@/features/editor/indent'
import { promptForLink } from '@/features/editor/link'
import { MathBlock, MathInline } from '@/features/editor/math'
import { PageBreak } from '@/features/editor/page-break'
import { type PageGeometry, pageGeometry } from '@/features/editor/page-geometry'
import { Pagination } from '@/features/editor/pagination'
import { PasteMarkdown } from '@/features/editor/paste-markdown'
import { type ResizableImageOptions, ResizableImage } from '@/features/editor/resizable-image'
import { SearchAndReplace } from '@/features/editor/search-replace'
import { SelectionHighlight } from '@/features/editor/selection-highlight'
import type { SlashCommandOptions, SlashCommandState } from '@/features/editor/slash-command'
import { SlashCommand } from '@/features/editor/slash-command'
import { TableHeaderRepeat } from '@/features/editor/table-header-repeat'
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
	onPageCountChange,
	collaboration,
	slashCommand,
}: {
	geometry?: PageGeometry
	onPageCountChange?: (pageCount: number) => void
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
		// (pewarnaan sintaks) di bawah.
		StarterKit.configure({ link: false, codeBlock: false, undoRedo: collaboration ? false : undefined }),
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
		Typography,
		TableKit.configure({ table: { resizable: true } }),
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
		SelectionHighlight,
		BlockIndentExtension,
		BlockSpacing,
		TextWeight,
		PageBreak,
		TableHeaderRepeat,
		CommentMark,
		MathInline,
		MathBlock,
		PasteMarkdown,
		// Cari & ganti; dekorasi menyorot kecocokan, perintah menggerakkan indeks.
		SearchAndReplace,
		TrailingParagraph,
		Pagination.configure({ geometry, onPageCountChange }),
		// Menu slash hanya untuk editor sungguhan.
		...(slashCommand
			? [SlashCommand.configure({ onOpen: slashCommand.onOpen, onUpdate: slashCommand.onUpdate, onClose: slashCommand.onClose })]
			: []),
		...(collaboration
			? [Collaboration.configure({ document: collaboration.document, field: collaboration.field })]
			: []),
	]
}
