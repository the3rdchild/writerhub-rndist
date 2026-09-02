'use client'

import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Code2, Eye, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clampHtmlBlockHeight, type HtmlBlockAttrs } from '@/features/editor/html-block'
import { rasterizeHtml } from '@/features/editor/html-raster'
import { HTML_SANDBOX, sandboxDocument } from '@/features/editor/html-sandbox'
import { cn } from '@/lib/utils'

export const HTML_REFRESH_EVENT = 'writerhub:html-refresh'

interface RefreshRequest {
	/** Tiap blok menaruh janji potretannya di sini supaya ekspor bisa menunggu. */
	pending: Promise<void>[]
}

/**
 * Memotret ulang seluruh blok HTML lalu menunggu semuanya selesai.
 *
 * Berbeda dari `refreshTocBlocks` yang serentak, memotret itu asinkron - SVG-nya
 * harus dimuat sebagai gambar dulu - jadi pemanggilnya wajib menunggu. Tanpa itu
 * ekspor berjalan mendahului potretan dan blok yang baru berubah ikut sebagai
 * gambar lama.
 */
export async function refreshHtmlBlocks(dom: HTMLElement): Promise<void> {
	const detail: RefreshRequest = { pending: [] }
	dom.dispatchEvent(new CustomEvent<RefreshRequest>(HTML_REFRESH_EVENT, { bubbles: true, detail }))
	await Promise.all(detail.pending)
}

const MIN_DRAG_HEIGHT = 48

/** Jeda singkat supaya bingkainya sempat menempati ruangnya sebelum diukur. */
const CAPTURE_DELAY_MS = 250

export function HtmlBlockView({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
	const attrs = node.attrs as HtmlBlockAttrs
	const frameRef = useRef<HTMLIFrameElement>(null)
	const [showSource, setShowSource] = useState(false)

	const updateAttributesRef = useRef(updateAttributes)
	updateAttributesRef.current = updateAttributes

	const document_ = useMemo(() => sandboxDocument(attrs.html), [attrs.html])

	const capture = useCallback(async () => {
		const frame = frameRef.current
		if (!frame) return

		const width = Math.round(frame.clientWidth)
		// Bingkai yang belum menempati ruangnya melaporkan tinggi 0; tinggi
		// atribut adalah nilai yang memang ia tuju, jadi ia penambal yang benar.
		const height = Math.round(frame.clientHeight) || attrs.height
		const snapshot = await rasterizeHtml(attrs.html, width, height)
		if (!snapshot) return

		updateAttributesRef.current({ snapshot, snapshotWidth: width, snapshotHeight: height })
	}, [attrs.html, attrs.height])

	// Memotret begitu rancangannya berubah, bukan hanya saat ekspor. Ekspor
	// multi-tab membaca isi dari Y.Doc, bukan dari DOM: blok di tab yang sedang
	// tidak terbuka tidak punya bingkai untuk dipotret, jadi potretannya harus
	// sudah tersimpan sejak ia terlihat.
	useEffect(
		function captureOnChange(): () => void {
			const timer = setTimeout(() => void capture(), CAPTURE_DELAY_MS)
			return () => clearTimeout(timer)
		},
		[capture],
	)

	useEffect(
		function captureOnPrintOrExport(): () => void {
			const dom = editor.view.dom
			const onRefreshRequest = (event: Event) => {
				const detail = (event as CustomEvent<RefreshRequest>).detail
				const running = capture()
				detail?.pending?.push(running)
			}
			const onBeforePrint = () => void capture()

			window.addEventListener('beforeprint', onBeforePrint)
			dom.addEventListener(HTML_REFRESH_EVENT, onRefreshRequest)
			return () => {
				window.removeEventListener('beforeprint', onBeforePrint)
				dom.removeEventListener(HTML_REFRESH_EVENT, onRefreshRequest)
			}
		},
		[editor, capture],
	)

	const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
		event.preventDefault()
		const startY = event.clientY
		const startHeight = attrs.height

		const onMove = (move: PointerEvent) => {
			const next = Math.max(MIN_DRAG_HEIGHT, startHeight + (move.clientY - startY))
			updateAttributesRef.current({ height: clampHtmlBlockHeight(next) })
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	return (
		<NodeViewWrapper className={cn('html-block', selected && 'html-block-selected')} data-drag-handle>
			<div className="html-block-bar" contentEditable={false}>
				<span className="html-block-label">Rancangan HTML</span>
				<button type="button" onClick={() => setShowSource((current) => !current)}>
					{showSource ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
					{showSource ? 'Hasil' : 'Sumber'}
				</button>
				<button type="button" onClick={() => deleteNode()} aria-label="Hapus blok">
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>

			{showSource ? (
				<pre className="html-block-source" style={{ height: attrs.height }}>
					{attrs.html}
				</pre>
			) : (
				<iframe
					ref={frameRef}
					className="html-block-frame"
					title="Rancangan HTML"
					sandbox={HTML_SANDBOX}
					srcDoc={document_}
					style={{ height: attrs.height }}
				/>
			)}

			<button
				type="button"
				className="html-block-resize"
				aria-label="Ubah tinggi blok"
				onPointerDown={startResize}
			/>
		</NodeViewWrapper>
	)
}

export const HtmlBlockNodeView = ReactNodeViewRenderer(HtmlBlockView)
