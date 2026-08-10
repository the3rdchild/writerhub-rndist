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
import { ImageWithMarkdown, TrailingParagraph } from '@/features/editor/editor-polish'
import { BlockIndentExtension } from '@/features/editor/indent'
import { promptForLink } from '@/features/editor/link'
import { MathBlock, MathInline } from '@/features/editor/math'
import { PageBreak } from '@/features/editor/page-break'
import { type PageGeometry, pageGeometry } from '@/features/editor/page-geometry'
import { Pagination } from '@/features/editor/pagination'
import { PasteMarkdown } from '@/features/editor/paste-markdown'
import { SelectionHighlight } from '@/features/editor/selection-highlight'
import { TableHeaderRepeat } from '@/features/editor/table-header-repeat'
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
}: {
	geometry?: PageGeometry
	onPageCountChange?: (pageCount: number) => void
	/**
	 * Ikatan ke Y.Doc. Diisi editor sungguhan; dibiarkan kosong oleh editor
	 * sementara yang hanya perlu skemanya.
	 */
	collaboration?: { document: Y.Doc; field: string } | null
} = {}): Extensions {
	return [
		// Riwayat undo bawaan dimatikan saat naskah dipegang Yjs: keduanya
		// mencatat pembatalan sendiri-sendiri, dan dua pencatat pada satu naskah
		// membuat Ctrl+Z memutar balik perubahan yang bukan milik penekannya.
		StarterKit.configure({ link: false, undoRedo: collaboration ? false : undefined }),
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
		ImageWithMarkdown.configure({ inline: false, allowBase64: true }),
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
		TrailingParagraph,
		Pagination.configure({ geometry, onPageCountChange }),
		...(collaboration
			? [Collaboration.configure({ document: collaboration.document, field: collaboration.field })]
			: []),
	]
}
