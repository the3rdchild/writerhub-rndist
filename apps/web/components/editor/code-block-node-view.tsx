'use client'

import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { Check, Code2, Copy, Eye } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CODE_LANGUAGES } from '@/features/editor/code-block'
import { getMermaid } from '@/features/editor/lazy-mermaid'

export const MERMAID_REFRESH_EVENT = 'writerhub:mermaid-refresh'

interface RefreshRequest {
	/** Tiap blok menaruh janji render-nya di sini supaya ekspor bisa menunggu. */
	pending: Promise<void>[]
}

/**
 * Merender ulang diagram Mermaid yang sumbernya berubah, lalu menunggu semuanya
 * selesai.
 *
 * Sejajar dengan `refreshHtmlBlocks`, dan wajib ditunggu karena alasan yang
 * sama: Mermaid dimuat malas dan merender secara asinkron. Jalur cetak yang
 * memanggil `window.print()` tanpa menunggu ini akan menangkap diagram yang
 * baru diketik sebagai kode mentah - dialog cetak membeku begitu terbuka, jadi
 * render yang menyusul tidak lagi sempat masuk.
 */
export async function refreshMermaidBlocks(dom: HTMLElement): Promise<void> {
	const detail: RefreshRequest = { pending: [] }
	dom.dispatchEvent(new CustomEvent<RefreshRequest>(MERMAID_REFRESH_EVENT, { bubbles: true, detail }))
	await Promise.all(detail.pending)
}

type MermaidView = 'source' | 'preview'

/** Jeda supaya diagram tidak dirender ulang di tiap ketukan tombol. */
const RENDER_DELAY_MS = 300

export function CodeBlockNodeView({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
	const language = (node.attrs.language as string) || 'plaintext'
	const isMermaid = language === 'mermaid'
	const languageLabel = CODE_LANGUAGES.find((l) => l.value === language)?.label ?? language
	const [copied, setCopied] = useState(false)

	const code = node.textContent
	/*
	 * Sumber kebenaran diagram ada di atribut node (`features/editor/code-block.ts`),
	 * bukan di state komponen ini. Yang tersimpan tetap ditampilkan meski sumbernya
	 * baru berubah - lebih baik diagram yang sedikit tertinggal daripada petak
	 * kosong berkedip di tiap ketukan.
	 */
	const mermaidSvg = (node.attrs.mermaidSvg as string) || ''
	const isStale = (node.attrs.mermaidSource as string) !== code

	const [mermaidView, setMermaidView] = useState<MermaidView>('source')
	const [mermaidError, setMermaidError] = useState<string | null>(null)
	const mermaidId = `mermaid-${useId().replace(/:/g, '')}`

	const updateAttributesRef = useRef(updateAttributes)
	updateAttributesRef.current = updateAttributes

	/*
	 * Sumber yang sedang dirender. Render Mermaid berjalan asinkron sementara
	 * efek di bawah bisa berjalan lagi sebelum ia selesai (dan `refreshMermaidBlocks`
	 * memanggilnya dari luar); tanpa penanda ini satu sumber yang sama dirender
	 * dua kali berbarengan.
	 */
	const renderingRef = useRef<string | null>(null)

	const renderMermaid = useCallback(
		async (source: string): Promise<void> => {
			if (renderingRef.current === source) return
			renderingRef.current = source

			if (!source.trim()) {
				updateAttributesRef.current({ mermaidSvg: '', mermaidSource: source })
				setMermaidError(null)
				renderingRef.current = null
				return
			}

			try {
				const mermaid = await getMermaid()
				const { svg } = await mermaid.render(mermaidId, source)
				updateAttributesRef.current({ mermaidSvg: svg, mermaidSource: source })
				setMermaidError(null)
			} catch (err) {
				/*
				 * Sumber yang gagal tetap dicatat. Tanpa itu blok ini selamanya
				 * dianggap tertinggal, dan efeknya mencoba merender ulang diagram
				 * yang memang salah tulis di tiap render React.
				 */
				updateAttributesRef.current({ mermaidSvg: '', mermaidSource: source })
				setMermaidError(err instanceof Error ? err.message : String(err))
			} finally {
				renderingRef.current = null
			}
		},
		[mermaidId],
	)

	/*
	 * Dirender begitu sumbernya berubah, bukan hanya saat pratinjau dibuka.
	 * Diagram yang tidak pernah di-toggle penulis tetap harus punya SVG saat
	 * dokumennya dicetak atau diekspor.
	 */
	useEffect(
		function renderWhenSourceChanges(): (() => void) | undefined {
			if (!isMermaid || !isStale) return
			const timer = setTimeout(() => void renderMermaid(code), RENDER_DELAY_MS)
			return () => clearTimeout(timer)
		},
		[isMermaid, isStale, code, renderMermaid],
	)

	useEffect(
		function renderOnPrintOrExport(): () => void {
			const dom = editor.view.dom
			const onRefreshRequest = (event: Event) => {
				if (!isMermaid || !isStale) return
				const detail = (event as CustomEvent<RefreshRequest>).detail
				detail?.pending?.push(renderMermaid(code))
			}

			dom.addEventListener(MERMAID_REFRESH_EVENT, onRefreshRequest)
			return () => dom.removeEventListener(MERMAID_REFRESH_EVENT, onRefreshRequest)
		},
		[editor, isMermaid, isStale, code, renderMermaid],
	)

	const copyCode = useCallback(() => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		})
	}, [code])

	const onLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		updateAttributes({ language: event.target.value })
	}

	const toggleMermaidView = () => {
		setMermaidView((v) => (v === 'source' ? 'preview' : 'source'))
	}

	const showPreview = isMermaid && mermaidView === 'preview'

	return (
		<NodeViewWrapper className="code-block" data-selected={selected || undefined}>
			<div className="code-block-toolbar" contentEditable={false}>
				<select
					value={language}
					onChange={onLanguageChange}
					className="code-block-lang"
					aria-label="Bahasa kode"
				>
					{CODE_LANGUAGES.map((lang) => (
						<option key={lang.value} value={lang.value}>
							{lang.label}
						</option>
					))}
				</select>
				<span className="code-block-label">{languageLabel}</span>

				<div className="code-block-actions">
					{isMermaid && (
						<button
							type="button"
							onClick={toggleMermaidView}
							className="code-block-action"
							title={mermaidView === 'source' ? 'Pratinjau diagram' : 'Sunting sumber'}
							aria-label={mermaidView === 'source' ? 'Pratinjau diagram' : 'Sunting sumber'}
						>
							{mermaidView === 'source' ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
							{mermaidView === 'source' ? 'Pratinjau' : 'Sunting'}
						</button>
					)}
					<button
						type="button"
						onClick={copyCode}
						className="code-block-action"
						title="Salin kode"
						aria-label="Salin kode"
					>
						{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
						{copied ? 'Tersalin' : 'Salin'}
					</button>
					<button
						type="button"
						onClick={() => deleteNode()}
						className="code-block-action code-block-delete"
						title="Hapus blok"
						aria-label="Hapus blok"
					>
						×
					</button>
				</div>
			</div>

			{showPreview ? (
				<div className="code-block-mermaid-preview" contentEditable={false}>
					{mermaidError ? (
						<pre className="code-block-mermaid-error">{mermaidError}</pre>
					) : mermaidSvg ? (
						// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG dari Mermaid securityLevel 'strict'
						<div dangerouslySetInnerHTML={{ __html: mermaidSvg }} />
					) : (
						<p className="code-block-mermaid-empty">Merender diagram…</p>
					)}
					<button
						type="button"
						onClick={toggleMermaidView}
						className="code-block-mermaid-back"
						title="Kembali ke sumber"
					>
						<Code2 className="h-3.5 w-3.5" /> Sunting sumber
					</button>
				</div>
			) : (
				<pre className="code-block-pre" spellCheck={false}>
					<NodeViewContent className="code-block-code" />
				</pre>
			)}

			{/*
			 * Diagram untuk kertas, hadir bahkan saat penulis sedang melihat
			 * sumbernya. "Pratinjau" adalah pilihan tampilan di layar, bukan
			 * pernyataan bahwa blok ini kode - di kertas tidak ada yang bisa
			 * di-toggle, jadi yang dicetak selalu diagramnya. Disembunyikan di
			 * layar lewat CSS, bukan lewat kondisi di sini: kalau ia tidak ikut
			 * ke DOM, tidak ada yang bisa dimunculkan `@media print`.
			 */}
			{isMermaid && !showPreview && mermaidSvg && (
				<div className="code-block-mermaid-print" contentEditable={false} aria-hidden="true">
					{/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG dari Mermaid securityLevel 'strict' */}
					<div dangerouslySetInnerHTML={{ __html: mermaidSvg }} />
				</div>
			)}
		</NodeViewWrapper>
	)
}
