'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { DocumentPaper } from '@/components/editor/document-paper'
import { mergeTabContents } from '@/features/document/export-docx'
import { prepareForExport } from '@/features/document/prepare-export'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { DEFAULT_PAGE_SETUP, pageGeometry, type SheetGeometry } from '@/features/editor/page-geometry'
import { DEFAULT_TYPOGRAPHY } from '@/features/editor/typography'
import { useDocumentGeometry } from '@/features/editor/use-document-geometry'
import { EXPORT_READY_ATTRIBUTE, type ExportPayload } from '@/features/export/types'

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

export function ExportDocumentView({ payload }: { payload: ExportPayload }) {
	const first = payload.tabs[0]
	const setup = first?.layout?.pageSetup ?? payload.layout?.pageSetup ?? DEFAULT_PAGE_SETUP
	const typography = first?.layout?.typography ?? payload.layout?.typography ?? DEFAULT_TYPOGRAPHY
	const furniture = first?.layout?.furniture ?? payload.layout?.furniture ?? null

	const geometry = useMemo(() => pageGeometry(setup), [setup])
	const content = useMemo(() => mergeTabContents(payload.tabs.map((tab) => tab.content)), [payload.tabs])

	const [pageCount, setPageCount] = useState(1)
	const [sheets, setSheets] = useState<SheetGeometry[]>([])

	const editor = useEditor({
		immediatelyRender: false,
		extensions: buildEditorExtensions({
			geometry,
			setup,
			onPageCountChange: setPageCount,
			onSheetsChange: setSheets,
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
				if (!cancelled) document.body.setAttribute(EXPORT_READY_ATTRIBUTE, 'true')
			}, SETTLE_MS)

			return () => {
				cancelled = true
				clearTimeout(timer)
				document.body.removeAttribute(EXPORT_READY_ATTRIBUTE)
			}
		},
		// `pageCount` dan `sheets` ada di sini justru supaya efeknya diulang tiap
		// paginasi bergerak - itu mekanisme penundaannya, bukan dependensi yang
		// kelebihan.
		[editor, pageCount, sheets],
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
