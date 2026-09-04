'use client'

import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { ArrowDownToLine, Code2, Eye, Maximize2, Scissors, StretchHorizontal, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fontFaceCss } from '@/features/editor/font-embed'
import { clampHtmlBlockHeight, type HtmlBlockAttrs } from '@/features/editor/html-block'
import { rasterizeHtml } from '@/features/editor/html-raster'
import { HTML_PROBE_SOURCE, HTML_SANDBOX, sandboxDocument } from '@/features/editor/html-sandbox'
import { cn } from '@/lib/utils'

export const HTML_REFRESH_EVENT = 'writerhub:html-refresh'

/**
 * Ditempelkan ke pembungkus buatan TipTap, dan disasar `globals.css`.
 *
 * Atribut sendiri, bukan kelas `node-htmlBlock` bawaan TipTap: kelas itu
 * dibangun dari nama node di dalam pustaka dan bukan API yang kita kendalikan,
 * jadi menyandarkan tata letak halaman padanya berarti ia bisa patah diam-diam
 * saat pustakanya berganti versi.
 */
export const HTML_BLOCK_FIT_ATTR = 'data-html-block-fit'

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

/** Selisih sekecil ini datang dari pembulatan, bukan dari isi yang benar-benar hilang. */
const CLIP_TOLERANCE_PX = 4

/**
 * Di bawah bagian ini, rancangan satu halaman terbaca sebagai menggantung -
 * bukan sebagai pilihan tata letak.
 *
 * Sandbox hanya **menyediakan** tinggi halaman, ia tidak memaksa: rancangan
 * yang menulis tinggi tetap tetap boleh lebih pendek dari kertasnya. Penanda
 * inilah satu-satunya umpan balik bahwa itu terjadi.
 */
const UNDERFILL_RATIO = 0.9

export function HtmlBlockView({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
	const attrs = node.attrs as HtmlBlockAttrs
	const isPage = attrs.fit === 'page'
	const frameRef = useRef<HTMLIFrameElement>(null)
	const wrapperRef = useRef<HTMLDivElement>(null)
	const [showSource, setShowSource] = useState(false)
	/** Tinggi isi sebenarnya menurut bingkai; null berarti belum melapor. */
	const [contentHeight, setContentHeight] = useState<number | null>(null)

	const updateAttributesRef = useRef(updateAttributes)
	updateAttributesRef.current = updateAttributes

	/**
	 * Bingkainya tidak bisa memuat font dari URL - CSP-nya `font-src data:` -
	 * jadi bytes-nya harus ikut masuk ke `srcdoc`. Mengambilnya asinkron, jadi
	 * render pertama memakai font sistem dan render berikutnya menggantinya.
	 * Pergantian itu tidak terlihat sebagai kedipan karena `font-embed`
	 * menyimpan berkasnya: hanya blok pertama yang memakai satu keluarga yang
	 * benar-benar menunggu jaringan.
	 */
	const [fontCss, setFontCss] = useState('')

	useEffect(
		function embedFontsUsedByDesign(): () => void {
			let cancelled = false
			void fontFaceCss(attrs.html).then((css) => {
				if (!cancelled) setFontCss(css)
			})
			return () => {
				cancelled = true
			}
		},
		[attrs.html],
	)

	const document_ = useMemo(() => sandboxDocument(attrs.html, fontCss), [attrs.html, fontCss])

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

	/*
	 * Bingkai berasal unik tidak bisa dibaca dari luar, jadi tinggi isinya datang
	 * sebagai laporan (`html-sandbox.ts`). Pesannya disaring dua kali - harus
	 * berasal dari bingkai ini, dan harus membawa token dokumen ini - supaya
	 * bingkai lain di halaman yang sama tidak saling menimpa angka.
	 */
	useEffect(
		function listenForContentHeight(): () => void {
			const onMessage = (event: MessageEvent) => {
				if (event.source !== frameRef.current?.contentWindow) return
				const data = event.data as { source?: string; token?: string; height?: number } | null
				if (!data || data.source !== HTML_PROBE_SOURCE || data.token !== document_.token) return
				if (typeof data.height === 'number') setContentHeight(data.height)
			}
			window.addEventListener('message', onMessage)
			return () => window.removeEventListener('message', onMessage)
		},
		[document_.token],
	)

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

	/**
	 * Tinggi kotak konten halaman, dibaca dari properti kustom yang dipasang
	 * `document-canvas.tsx`. Node view di repo ini tidak memakai context React
	 * (lihat `toc-block-view.tsx`), jadi geometri diambil lewat gaya terhitung -
	 * cara yang sama dipakai `features/editor/columns.ts`.
	 */
	const pageLimit = useCallback((): number | undefined => {
		const host = wrapperRef.current
		if (!host) return undefined
		const raw = getComputedStyle(host).getPropertyValue('--page-content-height')
		const value = Number.parseFloat(raw)
		return Number.isFinite(value) && value > 0 ? value : undefined
	}, [])

	const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
		event.preventDefault()
		const startY = event.clientY
		const startHeight = attrs.height
		const limit = pageLimit()

		const onMove = (move: PointerEvent) => {
			const next = Math.max(MIN_DRAG_HEIGHT, startHeight + (move.clientY - startY))
			updateAttributesRef.current({ height: clampHtmlBlockHeight(next, limit) })
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	const toggleFit = () => {
		const next = isPage ? 'embed' : 'page'
		updateAttributesRef.current({
			fit: next,
			// Kembali jadi sisipan: tingginya harus muat satu halaman lagi.
			...(next === 'embed' ? { height: clampHtmlBlockHeight(attrs.height, pageLimit()) } : {}),
		})
	}

	/*
	 * Berapa piksel rancangannya melewati ruang yang tersedia. Mode halaman
	 * memotong, bukan mengecilkan - jadi selisihnya harus terlihat, kalau tidak
	 * bagian yang hilang (biasanya justru ajakan bertindak di dasar flyer)
	 * menghilang tanpa jejak dari hasil ekspor.
	 */
	const visibleHeight = frameRef.current?.clientHeight ?? 0
	const measured = contentHeight !== null && visibleHeight > 0
	const clipped = measured ? (contentHeight as number) - visibleHeight : 0
	const isClipped = clipped > CLIP_TOLERANCE_PX

	// Hanya mode halaman yang punya "penuh" untuk diukur; sisipan memang
	// setinggi yang penulis tentukan sendiri.
	const filled = measured ? (contentHeight as number) / visibleHeight : 1
	const isUnderfilled = isPage && !isClipped && filled < UNDERFILL_RATIO

	return (
		<NodeViewWrapper
			ref={wrapperRef}
			className={cn(
				'html-block',
				isPage ? 'html-block-page' : 'html-block-embed',
				selected && 'html-block-selected',
			)}
			data-drag-handle
		>
			<div className="html-block-bar" contentEditable={false}>
				<span className="html-block-label">{isPage ? 'Satu halaman' : 'Sisipan'}</span>
				<button type="button" onClick={toggleFit}>
					{isPage ? <StretchHorizontal className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
					{isPage ? 'Jadikan sisipan' : 'Jadikan satu halaman'}
				</button>
				<button type="button" onClick={() => setShowSource((current) => !current)}>
					{showSource ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
					{showSource ? 'Hasil' : 'Sumber'}
				</button>
				<button type="button" onClick={() => deleteNode()} aria-label="Hapus blok">
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>

			{showSource ? (
				<pre className="html-block-source" style={isPage ? undefined : { height: attrs.height }}>
					{attrs.html}
				</pre>
			) : (
				<div className="html-block-stage">
					<iframe
						ref={frameRef}
						className="html-block-frame"
						title="Rancangan HTML"
						sandbox={HTML_SANDBOX}
						srcDoc={document_.srcdoc}
						style={isPage ? undefined : { height: attrs.height }}
					/>
				</div>
			)}

			{isClipped && !showSource && (
				<div className="html-block-clipped" contentEditable={false}>
					<Scissors className="h-3.5 w-3.5" />
					Isi terpotong {Math.round(clipped)}px
				</div>
			)}

			{isUnderfilled && !showSource && (
				<div className="html-block-underfilled" contentEditable={false}>
					<ArrowDownToLine className="h-3.5 w-3.5" />
					Isi baru mengisi {Math.round(filled * 100)}% halaman
				</div>
			)}

			{!isPage && (
				<button
					type="button"
					className="html-block-resize"
					aria-label="Ubah tinggi blok"
					onPointerDown={startResize}
				/>
			)}
		</NodeViewWrapper>
	)
}

/*
 * `attrs` menempelkan mode blok ke elemen pembungkus buatan TipTap.
 *
 * Perlu, karena node view ini punya **dua** lapis DOM: TipTap membuat container
 * (`div.react-renderer.node-htmlBlock`) lalu memasang `NodeViewWrapper` di
 * dalamnya, dan yang menjadi anak langsung `.document-body` adalah containernya
 * - bukan elemen ber-kelas `.html-block-*`. Tanpa ini, aturan jarak antar blok
 * `.document-body > * + *` mengenai container dan mode halaman terdorong turun
 * beberapa piksel dari tepi kertas.
 */
export const HtmlBlockNodeView = ReactNodeViewRenderer(HtmlBlockView, {
	attrs: ({ node }) => ({ [HTML_BLOCK_FIT_ATTR]: String(node.attrs.fit) }),
})
