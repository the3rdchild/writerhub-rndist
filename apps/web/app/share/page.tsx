'use client'

import { ArrowLeft, FileText, Lock } from 'lucide-react'
import Link from 'next/link'
import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { pageGeometry } from '@/features/editor/page-geometry'
import { decodeShare } from '@/features/share/share-link'

/**
 * Halaman pembuka dokumen yang dibagikan lewat link lokal.
 *
 * Muatan dokumen diambil dari fragment hash URL, dikompres dengan gzip, dan
 * dimuat ke editor Tiptap dalam mode read-only. Karena link sepenuhnya lokal,
 * tidak ada otentikasi — siapa pun yang memiliki link dapat melihat salinan
 * dokumen yang dibagikan saat itu.
 */
export default function SharePage() {
	const [hash, setHash] = useState('')

	useEffect(() => {
		setHash(window.location.hash)
		const onHashChange = () => setHash(window.location.hash)
		window.addEventListener('hashchange', onHashChange)
		return () => window.removeEventListener('hashchange', onHashChange)
	}, [])

	const payload = useMemo(() => decodeShare(hash), [hash])

	const editor = useEditor({
		immediatelyRender: false,
		extensions: buildEditorExtensions({ geometry: pageGeometry() }),
		content: payload?.content,
		editable: false,
		editorProps: {
			attributes: {
				class: 'document-body focus:outline-none text-[17px] leading-[1.8]',
				spellcheck: 'false',
			},
		},
	})

	useEffect(() => {
		if (editor && payload?.content) {
			editor.commands.setContent(payload.content, { emitUpdate: false })
		}
	}, [editor, payload?.content])

	if (!payload) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
				<FileText className="h-12 w-12 text-faint" />
				<h1 className="mt-4 text-lg font-medium text-foreground">Link tidak valid</h1>
				<p className="mt-1 text-sm text-muted">
					Link dokumen ini rusak atau sudah kedaluwarsa.
				</p>
				<Link
					href="/"
					className="mt-6 rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
				>
					Kembali ke editor
				</Link>
			</div>
		)
	}

	const accessLabel = payload.access === 'restricted' ? 'Dibatasi' : 'Siapa saja dengan link'

	return (
		<div className="flex min-h-screen flex-col bg-background">
			{/* Header */}
			<header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-3">
				<div className="flex min-w-0 items-center gap-3">
					<Link
						href="/"
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						aria-label="Kembali ke editor"
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
					<div className="min-w-0">
						<h1 className="truncate text-base font-medium text-foreground">{payload.title}</h1>
						<div className="flex items-center gap-1.5 text-xs text-muted">
							<Lock className="h-3 w-3" />
							<span>{accessLabel}</span>
							<span>•</span>
							<span>{SHARE_ROLE_LABELS[payload.role]}</span>
						</div>
					</div>
				</div>
				<Link
					href="/"
					className="hidden rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover sm:inline-block"
				>
					Buka di editor
				</Link>
			</header>

			{/* Canvas */}
			<main className="flex flex-1 justify-center overflow-y-auto px-4 py-6">
				<div className="document-canvas w-full max-w-[816px]">
					<div className="document-sheet min-h-[1056px] bg-surface-raised p-[96px] shadow-[var(--page-shadow)]">
						<EditorContent editor={editor} />
					</div>
				</div>
			</main>
		</div>
	)
}

const SHARE_ROLE_LABELS: Record<'viewer' | 'commenter' | 'editor', string> = {
	viewer: 'Penonton',
	commenter: 'Komentator',
	editor: 'Penyunting',
}
