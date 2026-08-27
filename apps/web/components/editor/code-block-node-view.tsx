'use client'

import { Copy, Check, Eye, Code2 } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { type NodeViewProps, NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { CODE_LANGUAGES } from '@/features/editor/code-block'
import { getMermaid } from '@/features/editor/lazy-mermaid'
import { cn } from '@/lib/utils'
type MermaidView = 'source' | 'preview'

export function CodeBlockNodeView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
	const language = (node.attrs.language as string) || 'plaintext'
	const isMermaid = language === 'mermaid'
	const languageLabel = CODE_LANGUAGES.find((l) => l.value === language)?.label ?? language
	const [copied, setCopied] = useState(false)

	const code = node.textContent
	const [mermaidView, setMermaidView] = useState<MermaidView>('source')
	const [mermaidSvg, setMermaidSvg] = useState('')
	const [mermaidError, setMermaidError] = useState<string | null>(null)
	const mermaidId = `mermaid-${useId().replace(/:/g, '')}`
	const lastRenderedRef = useRef<{ source: string; svg: string }>({ source: '', svg: '' })

	const renderMermaid = useCallback(
		async (source: string) => {
			if (!source.trim()) {
				setMermaidSvg('')
				setMermaidError(null)
				return
			}
			try {
				const mermaid = await getMermaid()
				const { svg } = await mermaid.render(mermaidId, source)
				lastRenderedRef.current = { source, svg }
				setMermaidSvg(svg)
				setMermaidError(null)
			} catch (err) {
				setMermaidError(err instanceof Error ? err.message : String(err))
			}
		},
		[mermaidId],
	)
	useEffect(() => {
		if (!isMermaid) return
		if (mermaidView !== 'preview') return
		if (lastRenderedRef.current.source === code && lastRenderedRef.current.svg) {
			setMermaidSvg(lastRenderedRef.current.svg)
			return
		}
		const timer = setTimeout(() => void renderMermaid(code), 300)
		return () => clearTimeout(timer)
	}, [isMermaid, mermaidView, code, renderMermaid])

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
		</NodeViewWrapper>
	)
}
