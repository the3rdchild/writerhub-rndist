'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DocumentPaper } from '@/components/editor/document-paper'
import { mergeTabContents } from '@/features/document/export-docx'
import { prepareForExport } from '@/features/document/prepare-export'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { DEFAULT_PAGE_SETUP, pageGeometry, type SheetGeometry } from '@/features/editor/page-geometry'
import { DEFAULT_TYPOGRAPHY } from '@/features/editor/typography'
import { useDocumentGeometry } from '@/features/editor/use-document-geometry'
import {
	EXPORT_CLIPPED_ATTRIBUTE,
	EXPORT_PAGES_ATTRIBUTE,
	EXPORT_READY_ATTRIBUTE,
	type ExportPayload,
} from '@/features/export/types'

/**
 * Halaman yang dikunjungi perender berkas.
 *
 * Ia bukan tampilan untuk manusia: tidak ada header, panel, maupun kendali.
 * Yang ada hanya kertasnya - `DocumentPaper` yang sama dengan kanvas
 * penyunting, sehingga apa yang dipotret worker adalah dokumen yang sama persis
 * dengan yang dilihat penulisnya, termasuk aturan `@page` untuk mencetak.
 *
 * Semua tab digabung jadi satu aliran dengan pemenggal halaman di antaranya -
 * `mergeTabContents` yang sama yang dipakai ekspor DOCX multi-tab. Dokumen
 * berbilah banyak karena itu menghasilkan satu berkas, bukan satu berkas per
 * tab.
 */

/**
 * Jeda tanpa perubahan yang dianggap "paginasi sudah tenang".
 *
 * Paginasi menghitung ulang lewat `requestAnimationFrame` dan `ResizeObserver`,
 * jadi jumlah halaman masih bisa bergeser beberapa kali setelah render pertama.
 * Menandai siap terlalu dini berarti worker memotret dokumen yang lembarnya
 * masih berpindah - dan itu kegagalan yang tidak meninggalkan jejak apa pun di
 * log, hanya PDF yang halamannya salah.
 */
const SETTLE_MS = 400

/** Selisih sekecil ini datang dari pembulatan, bukan isi yang benar-benar hilang. */
const CLIP_TOLERANCE_PX = 4

export function ExportDocumentView({ payload }: { payload: ExportPayload }) {
	const first = payload.tabs[0]
	const setup = first?.layout?.pageSetup ?? payload.layout?.pageSetup ?? DEFAULT_PAGE_SETUP
	const typography = first?.layout?.typography ?? payload.layout?.typography ?? DEFAULT_TYPOGRAPHY
	const furniture = first?.layout?.furniture ?? payload.layout?.furniture ?? null

	const geometry = useMemo(() => pageGeometry(setup), [setup])
	const content = useMemo(() => mergeTabContents(payload.tabs.map((tab) => tab.content)), [payload.tabs])

	const [pageCount, setPageCount] = useState(1)
	const [sheets, setSheets] = useState<SheetGeometry[]>([])

	/*
	 * Berapa blok rancangan yang isinya melewati lembarannya (T4). Cara yang
	 * sama dengan probe di `html-sandbox.ts`: tinggi isi sebenarnya dihitung
	 * dari kotak batas anak-anak `<body>` bingkai - `scrollHeight` sudah
	 * terpotong oleh `overflow: hidden`, jadi tidak bisa dipakai. Bingkainya
	 * same-origin (`srcdoc`), jadi isinya terbaca dari luar. Angkanya ditulis
	 * ke `data-export-clipped` untuk dibaca worker - pemanggil API tidak
	 * pernah melihat lencana "Isi terpotong" yang tampil di layar.
	 */
	const countClippedDesigns = useCallback((): number => {
		const frames = document.querySelectorAll<HTMLIFrameElement>(
			".document-body [data-html-block-fit='page'] .html-block-frame",
		)
		let clipped = 0
		for (const frame of frames) {
			const body = frame.contentDocument?.body
			if (!body) continue
			let bottom = 0
			for (const child of Array.from(body.children)) {
				const box = child.getBoundingClientRect()
				if (box.bottom > bottom) bottom = box.bottom
			}
			if (bottom - frame.clientHeight > CLIP_TOLERANCE_PX) clipped += 1
		}
		return clipped
	}, [])

	const editor = useEditor({
		immediatelyRender: false,
		extensions: buildEditorExtensions({
			geometry,
			setup,
			onPageCountChange: setPageCount,
			onSheetsChange: setSheets,
			// Paragraf penutup adalah perkakas menyunting; editor di sini tidak
			// bisa disunting, dan paragraf itu menambah satu lembar kosong di
			// belakang rancangan `page: flyer` (docs/DRAFTS-API-FINDINGS.md T1).
			trailingParagraph: false,
		}),
		content,
		editable: false,
		editorProps: { attributes: { class: 'document-body', spellcheck: 'false' } },
	})

	useDocumentGeometry(editor, { geometry, setup })

	useEffect(
		function markReadyWhenSettled(): () => void {
			if (!editor) return () => undefined

			let cancelled = false
			// Tiap perubahan jumlah halaman menunda penanda; yang bertahan adalah
			// jeda terakhir setelah semuanya berhenti bergeser.
			const timer = setTimeout(async () => {
				await prepareForExport(editor)
				if (cancelled) return
				document.body.setAttribute(EXPORT_READY_ATTRIBUTE, 'true')
				document.body.setAttribute(EXPORT_PAGES_ATTRIBUTE, String(pageCount))
				document.body.setAttribute(EXPORT_CLIPPED_ATTRIBUTE, String(countClippedDesigns()))
			}, SETTLE_MS)

			return () => {
				cancelled = true
				clearTimeout(timer)
				document.body.removeAttribute(EXPORT_READY_ATTRIBUTE)
				document.body.removeAttribute(EXPORT_PAGES_ATTRIBUTE)
				document.body.removeAttribute(EXPORT_CLIPPED_ATTRIBUTE)
			}
		},
		// `pageCount` dan `sheets` ada di sini justru supaya efeknya diulang tiap
		// paginasi bergerak - itu mekanisme penundaannya, bukan dependensi yang
		// kelebihan.
		[editor, pageCount, sheets, countClippedDesigns],
	)

	return (
		<div className="document-canvas flex justify-center bg-white p-0">
			<DocumentPaper
				setup={setup}
				typography={typography}
				furniture={furniture}
				sheets={sheets}
				pageCount={pageCount}
				showPageNumbers={false}
			>
				<EditorContent editor={editor} />
			</DocumentPaper>
		</div>
	)
}
