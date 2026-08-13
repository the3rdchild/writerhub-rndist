'use client'

import type { Editor } from '@tiptap/react'
import { type ReactNode, useState } from 'react'
import {
	ALargeSmall,
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	Bold,
	Boxes,
	CaseSensitive,
	CheckSquare,
	CircleQuestionMark,
	Code,
	Code2,
	Columns2,
	Download,
	Eraser,
	Eye,
	FileText,
	Files,
	Highlighter,
	Image as ImageIcon,
	Indent,
	Info,
	Italic,
	Keyboard,
	Link2,
	List,
	ListOrdered,
	Minus,
	Outdent,
	Pencil,
	Plus,
	Printer,
	Quote,
	Redo2,
	RotateCcw,
	Search,
	Settings as SettingsIcon,
	Sigma,
	SquarePlus,
	Strikethrough,
	Subscript,
	Superscript,
	Table as TableIcon,
	TextCursor,
	Type,
	Underline,
	Undo2,
	Upload,
	Wrench,
} from 'lucide-react'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { InsertImageDialog } from '@/components/editor/insert-image-dialog'
import { refreshTocBlocks } from '@/components/editor/toc-block-view'
import { PANELS } from '@/components/panels/panel-rail'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { download, safeFilename } from '@/features/document/download'
import { exportDocx } from '@/features/document/export-docx'
import { useDocumentImport } from '@/features/document/import-context'
import { promptForLink } from '@/features/editor/link'
import { convertMathInDocument, convertSelectionToMath } from '@/features/editor/math'
import { isInsideTable, tableRepeatsHeader } from '@/features/editor/table-header-repeat'
import {
	DEFAULT_MARGINS,
	pageGeometry,
	PAGE_SIZES,
	type PageSizeId,
	ZOOM_LEVELS,
} from '@/features/editor/page-geometry'
import { applyCapitalization } from '@/features/editor/capitalization'
import {
	FONT_CATEGORY_LABELS,
	FONT_FAMILIES,
	type FontCategory,
	fontFamilyLabel,
} from '@/features/editor/font-catalog'
import { indentSelection, outdentSelection } from '@/features/editor/indent'
import { LINE_HEIGHTS, ALL_PARAGRAPH_STYLES, PARAGRAPH_STYLES } from '@/features/editor/text-styles'
import { sectionRange } from '@/features/editor/section-scope'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { cn, countWords } from '@/lib/utils'

/**
 * Menu bar bergaya pengolah kata.
 *
 * Setiap butir benar-benar menjalankan sesuatu; tidak ada yang sekadar hiasan.
 * Butir yang belum punya perilaku lebih baik tidak dipasang sama sekali
 * daripada memberi kesan fitur yang sebenarnya belum ada.
 */
export function MenuBar() {
	const { editor } = useEditorInstance()
	const { state, dispatch } = useDocument()
	const { settings, update, toggleFocusMode, setSettingsOpen, setShortcutsOpen, setExportOpen, setDocxExportOpen, setPageSetupOpen } =
		useSettings()
	const { newSession, deleteSession, activeId, sessions } = useSessions()
	const { setup: activeSetup, setPageSetup } = usePageSetup()
	const { openImport } = useDocumentImport()
	const { activePanel, setActivePanel } = usePanels()

	// Label pintasan datang dari registry, bukan diketik di sini - dulu teksnya
	// ditulis manual dan sempat menjanjikan tombol yang tidak pernah didaftarkan.
	const keys = useShortcutLabel()

	const downloadText = () => {
		download(
			new Blob([state.text], { type: 'text/plain;charset=utf-8' }),
			safeFilename(state.title, 'txt'),
		)
	}

	const [exporting, setExporting] = useState(false)
	const [imageDialogOpen, setImageDialogOpen] = useState(false)

	// Kapitalisasi hanya bekerja pada teks yang disorot; tanpa seleksi butirnya
	// dimatikan alih-alih diam-diam mengubah paragraf yang sedang ditulis.
	//
	// Sengaja fungsi, bukan nilai: MenuBar tidak berlangganan transaksi editor,
	// jadi nilai yang dihitung di sini akan membeku pada render terakhir dan
	// butirnya tetap mati meski teks sudah disorot. Dipanggil dari dalam render
	// prop menu, pembacaannya terjadi saat menu dibuka - selalu terkini.
	const hasSelection = () => Boolean(editor && !editor.state.selection.empty)

	const downloadDocx = async () => {
		if (!editor || exporting) return
		// Segarkan snapshot blok TOC dulu supaya nomor halaman yang diekspor
		// mutakhir (§A5.3); menulis node lewat Y.Doc jadi tab aktif ikut terbawa
		// juga saat ekspor multi-tab.
		refreshTocBlocks(editor.view.dom)
		// Dokumen bertab banyak ditanyakan dulu tab mana yang ikut; dokumen satu
		// tab langsung diekspor tanpa dialog.
		if (sessions.length > 1) {
			setDocxExportOpen(true)
			return
		}
		setExporting(true)
		try {
			const geometry = pageGeometry(activeSetup)
			download(
				await exportDocx(editor.state.doc, { title: state.title, geometry, setup: activeSetup }),
				safeFilename(state.title, 'docx'),
			)
		} finally {
			setExporting(false)
		}
	}

	return (
		<>
		<nav className="flex items-center gap-0.5" aria-label="Menu dokumen">
			<Menu label="File" icon={<FileText className="h-4 w-4" />}>
				{({ close }) => (
					<>
						<Item icon={<Files className="h-4 w-4" />} onSelect={() => run(close, newSession)} shortcut={keys('doc.newTab')}>
							Tab baru
						</Item>
						<DropdownSeparator />
						{/* Impor & ekspor dikelompokkan sebagai submenu supaya daftar tetap
						    ringkas; tiap submenu hanya berisi format yang relevan. */}
						<Submenu label="Impor" icon={<Upload className="h-4 w-4" />}>
							{() => (
								<>
									<Item icon={<FileText className="h-4 w-4" />} onSelect={() => run(close, () => openImport('docx'))}>
										Word (.docx) - dengan format
									</Item>
									<Item icon={<FileText className="h-4 w-4" />} onSelect={() => run(close, () => openImport('text'))}>
										PDF atau teks - teks saja
									</Item>
								</>
							)}
						</Submenu>
						<Submenu label="Ekspor" icon={<Download className="h-4 w-4" />}>
							{() => (
								<>
									<Item icon={<FileText className="h-4 w-4" />} onSelect={() => run(close, () => setExportOpen(true))}>
										PDF…
									</Item>
									<Item icon={<FileText className="h-4 w-4" />} disabled={!editor || exporting} onSelect={() => run(close, downloadDocx)}>
										Word (.docx)
									</Item>
									<Item icon={<FileText className="h-4 w-4" />} onSelect={() => run(close, downloadText)}>
										Teks polos (.txt)
									</Item>
								</>
							)}
						</Submenu>
						<Item icon={<Printer className="h-4 w-4" />} onSelect={() => run(close, () => window.print())} shortcut={keys('doc.print')}>
							Cetak
						</Item>
						<DropdownSeparator />
						<Item
							icon={<Boxes className="h-4 w-4" />}
							disabled={!activeId}
							onSelect={() => run(close, () => setPageSetupOpen(true))}
						>
							Penyiapan halaman…
						</Item>
						<DropdownSeparator />
						<Item icon={<RotateCcw className="h-4 w-4" />} disabled={!activeId} shortcut={keys('doc.closeTab')} onSelect={() => run(close, () => activeId && deleteSession(activeId))}>
							Tutup tab ini
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Edit" icon={<Pencil className="h-4 w-4" />}>
				{({ close }) => (
					<>
						<Item
							icon={<Undo2 className="h-4 w-4" />}
							disabled={!editor?.can().undo()}
							shortcut={keys('doc.undo')}
							onSelect={() => run(close, () => editor?.chain().focus().undo().run())}
						>
							Urungkan
						</Item>
						<Item
							icon={<Redo2 className="h-4 w-4" />}
							disabled={!editor?.can().redo()}
							shortcut={keys('doc.redo')}
							onSelect={() => run(close, () => editor?.chain().focus().redo().run())}
						>
							Ulangi
						</Item>
						<DropdownSeparator />
						<Item
							icon={<FileText className="h-4 w-4" />}
							shortcut={keys('doc.selectAll')}
							onSelect={() => run(close, () => editor?.chain().focus().selectAll().run())}
						>
							Pilih semua
						</Item>
						<Item icon={<FileText className="h-4 w-4" />} onSelect={() => run(close, () => navigator.clipboard.writeText(state.text))}>
							Salin seluruh teks
						</Item>
						<DropdownSeparator />
						<Item icon={<Eraser className="h-4 w-4" />} onSelect={() => run(close, () => dispatch({ type: 'clear' }))}>
							Kosongkan dokumen
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Tampilan" icon={<Eye className="h-4 w-4" />}>
				{({ close }) => (
					<>
						<Item active={settings.focusMode} onSelect={() => run(close, toggleFocusMode)}>
							Mode fokus
						</Item>
						<Item
							active={settings.showRuler}
							onSelect={() => run(close, () => update({ showRuler: !settings.showRuler }))}
						>
							Penggaris
						</Item>
						<Item
							active={settings.showDocumentTabs}
							onSelect={() =>
								run(close, () => update({ showDocumentTabs: !settings.showDocumentTabs }))
							}
						>
							Tab dokumen
						</Item>
						<Item
							active={settings.showPageNumbers}
							onSelect={() =>
								run(close, () => update({ showPageNumbers: !settings.showPageNumbers }))
							}
						>
							Nomor halaman
						</Item>
						<Item
							active={settings.showWordCount}
							onSelect={() => run(close, () => update({ showWordCount: !settings.showWordCount }))}
						>
							Jumlah kata
						</Item>
						<Item
							active={activeSetup.pageless}
							onSelect={() => run(close, () => setPageSetup({ ...activeSetup, pageless: !activeSetup.pageless }, 'document'))}
						>
							Pageless
						</Item>
						<DropdownSeparator />
						{/* Perbesaran jadi submenu supaya daftar tingkat zoom tidak
						    memanjangkan menu utama. */}
						<Submenu label="Perbesaran" icon={<Search className="h-4 w-4" />}>
							{() => (
								<>
									{ZOOM_LEVELS.map((level) => (
										<Item
											key={level}
											active={settings.zoom === level}
											onSelect={() => run(close, () => update({ zoom: level }))}
										>
											{Math.round(level * 100)}%
										</Item>
									))}
								</>
							)}
						</Submenu>
					</>
				)}
			</Menu>

			<Menu label="Sisip" icon={<SquarePlus className="h-4 w-4" />}>
				{({ close }) => (
					<>
						<Item icon={<ImageIcon className="h-4 w-4" />} onSelect={() => run(close, () => setImageDialogOpen(true))}>
							Gambar…
						</Item>
						<Item
							icon={<Link2 className="h-4 w-4" />}
							shortcut={keys('text.link')}
							onSelect={() => run(close, () => editor && promptForLink(editor))}
						>
							Tautan…
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Blok</DropdownLabel>
						<Item
							icon={<Highlighter className="h-4 w-4" />}
							onSelect={() => run(close, () => editor?.chain().focus().setCallout('info').run())}
						>
							Callout…
						</Item>
						<Item icon={<Quote className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleBlockquote().run())}>
							Kutipan
						</Item>
						<Item icon={<Code className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleCodeBlock({ language: 'plaintext' }).run())}>
							Teks polos
						</Item>
						<Item icon={<Code2 className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleCodeBlock({ language: 'javascript' }).run())}>
							Blok kode
						</Item>
						<Item icon={<Sigma className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleCodeBlock({ language: 'mermaid' }).run())}>
							Diagram Mermaid…
						</Item>
						<DropdownSeparator />
						<DropdownLabel>Daftar</DropdownLabel>
						<Item icon={<List className="h-4 w-4" />} disabled={!activeId} onSelect={() => run(close, () => editor?.chain().focus().insertToc({ listKind: 'isi' }).run())}>
							Daftar isi
						</Item>
						<Item icon={<ImageIcon className="h-4 w-4" />} disabled={!activeId} onSelect={() => run(close, () => editor?.chain().focus().insertToc({ listKind: 'gambar' }).run())}>
							Daftar gambar
						</Item>
						<Item icon={<TableIcon className="h-4 w-4" />} disabled={!activeId} onSelect={() => run(close, () => editor?.chain().focus().insertToc({ listKind: 'tabel' }).run())}>
							Daftar tabel
						</Item>
						<Item icon={<Code className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleCode().run())}>
							Kode (dalam baris)
						</Item>
						<DropdownSeparator />
						<Item
							icon={<TableIcon className="h-4 w-4" />}
							onSelect={() =>
								run(close, () =>
									editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
								)
							}
						>
							Tabel 3×3
						</Item>
						<Item
							icon={<Minus className="h-4 w-4" />}
							onSelect={() => run(close, () => editor?.chain().focus().setHorizontalRule().run())}
						>
							Garis horizontal
						</Item>
						<Item
							icon={<CheckSquare className="h-4 w-4" />}
							shortcut={keys('para.taskList')}
							onSelect={() => run(close, () => editor?.chain().focus().toggleTaskList().run())}
						>
							Daftar centang
						</Item>
						<Item
							icon={<FileText className="h-4 w-4" />}
							shortcut={keys('doc.pageBreak')}
							onSelect={() => run(close, () => editor?.chain().focus().setPageBreak().run())}
						>
							Halaman baru
						</Item>
						<Item
							icon={<TableIcon className="h-4 w-4" />}
							disabled={!isInsideTable(editor)}
							active={tableRepeatsHeader(editor)}
							onSelect={() =>
								run(close, () => editor?.chain().focus().toggleTableHeaderRepeat().run())
							}
						>
							Ulang header tabel
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Format" icon={<Type className="h-4 w-4" />}>
				{({ close }) => (
					<>
						{/* ── Teks: gaya huruf, jenis & ukuran, kapitalisasi ──
						    Warna sengaja tidak ada di sini: palet 24 warna jadi 24 baris
						    menu yang payah dibaca, sementara toolbar sudah punya kisi
						    swatch yang jauh lebih pas untuk itu. */}
						<Submenu label="Teks" icon={<Type className="h-4 w-4" />}>
							{() => (
								<>
									<Item icon={<Bold className="h-4 w-4" />} shortcut={keys('text.bold')} onSelect={() => run(close, () => editor?.chain().focus().toggleBold().run())}>
										Tebal
									</Item>
									<Item icon={<Italic className="h-4 w-4" />} shortcut={keys('text.italic')} onSelect={() => run(close, () => editor?.chain().focus().toggleItalic().run())}>
										Miring
									</Item>
									<Item icon={<Underline className="h-4 w-4" />} shortcut={keys('text.underline')} onSelect={() => run(close, () => editor?.chain().focus().toggleUnderline().run())}>
										Garis bawah
									</Item>
									<Item icon={<Strikethrough className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleStrike().run())}>
										Coret
									</Item>
									<DropdownSeparator />
									<Item icon={<Subscript className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleSubscript().run())}>
										Subscript
									</Item>
									<Item icon={<Superscript className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleSuperscript().run())}>
										Superscript
									</Item>
									<DropdownSeparator />
									{/* Jenis huruf dikelompokkan per kategori: 30 nama dalam satu
									    daftar datar tidak bisa dipindai, sementara per kategori
									    tidak ada kelompok yang lebih dari selusin. */}
									<Submenu label="Jenis huruf" icon={<Type className="h-4 w-4" />}>
										{() => (
											<>
												{(Object.keys(FONT_CATEGORY_LABELS) as FontCategory[]).map((category) => (
													<Submenu key={category} label={FONT_CATEGORY_LABELS[category]}>
														{() => (
															<>
																{FONT_FAMILIES.filter((font) => font.category === category).map((font) => (
																	<Item
																		key={font.value}
																		onSelect={() => run(close, () => editor?.chain().focus().setFontFamily(font.value).run())}
																	>
																		{fontFamilyLabel(font.value)}
																	</Item>
																))}
															</>
														)}
													</Submenu>
												))}
											</>
										)}
									</Submenu>
									{/* Ukuran huruf naik-turun selangkah, bukan daftar angka:
									    angka pastinya urusan toolbar yang punya kolom isian.
									    Dua butir ini sengaja TIDAK menutup menu - menaikkan tiga
									    poin mestinya tiga klik, bukan tiga kali buka menu. */}
									<Submenu label="Ukuran huruf" icon={<ALargeSmall className="h-4 w-4" />}>
										{() => (
											<>
												<Item icon={<Plus className="h-4 w-4" />} onSelect={() => stepFontSize(editor, 1)}>
													Perbesar
												</Item>
												<Item icon={<Minus className="h-4 w-4" />} onSelect={() => stepFontSize(editor, -1)}>
													Perkecil
												</Item>
											</>
										)}
									</Submenu>
									<Submenu label="Kapitalisasi" icon={<CaseSensitive className="h-4 w-4" />}>
										{() => (
											<>
												<Item
													disabled={!hasSelection()}
													onSelect={() => run(close, () => applyCapitalization(editor, 'lower'))}
												>
													huruf kecil
												</Item>
												<Item
													disabled={!hasSelection()}
													onSelect={() => run(close, () => applyCapitalization(editor, 'upper'))}
												>
													HURUF BESAR
												</Item>
												<Item
													disabled={!hasSelection()}
													onSelect={() => run(close, () => applyCapitalization(editor, 'title'))}
												>
													Huruf Kapital Setiap Kata
												</Item>
											</>
										)}
									</Submenu>
								</>
							)}
						</Submenu>

						{/* ── Gaya paragraf ── */}
						<Submenu label="Gaya paragraf" icon={<TextCursor className="h-4 w-4" />}>
							{() => {
								// Tingkat 6–9 tidak bisa dipilih dari sini (cuma 1–5), tapi kalau
								// kursor sedang di salah satunya, tampilkan apa adanyanya supaya
								// tidak terlihat seperti tidak ada gaya aktif.
								const activeStyle = editor
									? ALL_PARAGRAPH_STYLES.find((s) => s.isActive(editor))
									: undefined
								const highLevel =
									activeStyle && !PARAGRAPH_STYLES.some((s) => s.id === activeStyle.id)
										? activeStyle
										: undefined
								return (
									<>
										{highLevel && (
											<Item key={highLevel.id} active disabled>
												{highLevel.label} (papan tik)
											</Item>
										)}
										{PARAGRAPH_STYLES.map((style) => (
											<Item
												key={style.id}
												active={editor ? style.isActive(editor) : false}
												onSelect={() => run(close, () => editor && style.apply(editor))}
											>
												{style.label}
											</Item>
										))}
									</>
								)
							}}
						</Submenu>

						{/* ── Perataan ── */}
						<Submenu label="Perataan" icon={<AlignLeft className="h-4 w-4" />}>
							{() => (
								<>
									<Item icon={<AlignLeft className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('left').run())}>
										Rata kiri
									</Item>
									<Item icon={<AlignCenter className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('center').run())}>
										Rata tengah
									</Item>
									<Item icon={<AlignRight className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('right').run())}>
										Rata kanan
									</Item>
									<Item icon={<AlignJustify className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('justify').run())}>
										Rata kanan-kiri
									</Item>
								</>
							)}
						</Submenu>

						{/* ── Spasi baris ── */}
						<Submenu label="Spasi baris" icon={<AlignJustify className="h-4 w-4" />}>
							{() => (
								<>
									{LINE_HEIGHTS.map((option) => (
										<Item
											key={option.value}
											onSelect={() => run(close, () => editor?.chain().focus().setLineHeight(option.value).run())}
										>
											{option.label}
										</Item>
									))}
								</>
							)}
						</Submenu>

						{/* ── Daftar & penomoran ── */}
						<Submenu label="Daftar & penomoran" icon={<List className="h-4 w-4" />}>
							{() => (
								<>
									<Item icon={<List className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleBulletList().run())}>
										Daftar butir
									</Item>
									<Item icon={<ListOrdered className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleOrderedList().run())}>
										Daftar nomor
									</Item>
									<Item icon={<CheckSquare className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().toggleTaskList().run())}>
										Daftar centang
									</Item>
									<DropdownSeparator />
									<Item icon={<Indent className="h-4 w-4" />} onSelect={() => run(close, () => indentSelection(editor))}>
										Tambah indentasi
									</Item>
									<Item icon={<Outdent className="h-4 w-4" />} onSelect={() => run(close, () => outdentSelection(editor))}>
										Kurangi indentasi
									</Item>
								</>
							)}
						</Submenu>

						{/* ── Kolom (multi-kolom) ──
						    Dua cakupan, dan keduanya disebut terang-terangan.

						    Versi sebelumnya hanya punya satu, "seleksi", dan mematikan
						    butirnya saat tidak ada teks yang disorot - sehingga menu ini
						    mati justru pada permintaan yang paling lazim ("halaman ini dua
						    kolom"), padahal AI Chat dan dialog Penyiapan halaman sudah
						    bisa melakukannya. Alasan menonaktifkannya tetap berlaku untuk
						    cakupan seleksi saja: tanpa seleksi, yang terbungkus cuma
						    paragraf tempat kursor berada. */}
						<Submenu label="Columns" icon={<Columns2 className="h-4 w-4" />}>
							{() => (
								<>
									<DropdownLabel>Selected text</DropdownLabel>
									{[2, 3].map((count) => (
										<Item
											key={`selection-${count}`}
											icon={<Columns2 className="h-4 w-4" />}
											disabled={!hasSelection()}
											onSelect={() =>
												run(close, () => editor?.chain().focus().setColumns(count).run())
											}
										>
											{count === 2 ? 'Two columns' : 'Three columns'}
										</Item>
									))}

									<DropdownSeparator />
									<DropdownLabel>This page</DropdownLabel>
									{[2, 3].map((count) => (
										<Item
											key={`page-${count}`}
											icon={<Columns2 className="h-4 w-4" />}
											onSelect={() =>
												run(close, () => {
													if (!editor) return
													const range = sectionRange(editor, 'this_page')
													if (!range) return
													editor
														.chain()
														.focus()
														.applySectionColumns({ count }, range, activeSetup)
														.run()
												})
											}
										>
											{count === 2 ? 'Two columns' : 'Three columns'}
										</Item>
									))}

									<DropdownSeparator />
									<Item onSelect={() => run(close, () => editor?.chain().focus().unsetColumns().run())}>
										Single column (revert)
									</Item>
								</>
							)}
						</Submenu>

						{/* ── Rumus ── */}
						<Submenu label="Formula" icon={<Sigma className="h-4 w-4" />}>
							{() => (
								<>
									<Item
										icon={<Sigma className="h-4 w-4" />}
										disabled={!editor || editor.state.selection.empty}
										onSelect={() => run(close, () => editor && convertSelectionToMath(editor, false))}
									>
										Make formula
									</Item>
									<Item
										icon={<Sigma className="h-4 w-4" />}
										disabled={!editor || editor.state.selection.empty}
										onSelect={() => run(close, () => editor && convertSelectionToMath(editor, true))}
									>
										Make block formula
									</Item>
									<DropdownSeparator />
									<Item onSelect={() => run(close, () => editor && convertMathInDocument(editor))}>
										Convert all $formulas$ in the document
									</Item>
								</>
							)}
						</Submenu>

						<DropdownSeparator />
						<Item icon={<Eraser className="h-4 w-4" />} onSelect={() => run(close, () => editor?.chain().focus().unsetAllMarks().clearNodes().run())}>
							Clear formatting
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Tools" icon={<Wrench className="h-4 w-4" />}>
				{({ close }) => (
					<>
						{/* Dibangun dari daftar tool rail, bukan diketik ulang: dulu menu ini
						    hanya memuat lima dari sembilan panel dengan ikon yang tidak
						    berhubungan sama sekali dengan ikon di rail. */}
						{PANELS.map((panel) => (
							<Item
								key={panel.id}
								icon={<panel.icon className="h-4 w-4" />}
								active={activePanel === panel.id}
								onSelect={() => run(close, () => setActivePanel(panel.id))}
							>
								{panel.label}
							</Item>
						))}
						<DropdownSeparator />
						<Item disabled>
							{countWords(state.text)} words · {state.text.length} characters
						</Item>
						<DropdownSeparator />
						<Item icon={<SettingsIcon className="h-4 w-4" />} onSelect={() => run(close, () => setSettingsOpen(true))}>
							Settings…
						</Item>
					</>
				)}
			</Menu>

			<Menu label="Bantuan" icon={<CircleQuestionMark className="h-4 w-4" />}>
				{({ close }) => (
					<>
						<Item
							icon={<Keyboard className="h-4 w-4" />}
							shortcut={keys('view.shortcuts')}
							onSelect={() => run(close, () => setShortcutsOpen(true))}
						>
							Pintasan papan tik…
						</Item>
						<DropdownSeparator />
						<Item icon={<Info className="h-4 w-4" />} onSelect={() => run(close, () => setSettingsOpen(true))}>
							Tentang WritingHub
						</Item>
					</>
				)}
			</Menu>
		</nav>

		<InsertImageDialog
			open={imageDialogOpen}
			onInsert={(attrs) => {
				editor?.chain().focus().setImage(attrs).run()
				setImageDialogOpen(false)
			}}
			onCancel={() => setImageDialogOpen(false)}
		/>
		</>
	)
}

/** Ukuran huruf saat atribut `fontSize` belum pernah disetel. */
const DEFAULT_FONT_SIZE = 11

/**
 * Naik/turun satu poin dari ukuran yang sedang aktif.
 *
 * Batas 6-96 pt dan langkah 1 pt mengikuti tombol +/- di toolbar, supaya dua
 * jalan menuju hal yang sama tidak berakhir di angka yang berbeda.
 */
function stepFontSize(editor: Editor | null, delta: number): void {
	if (!editor) return
	const parsed = Number.parseFloat(String(editor.getAttributes('textStyle').fontSize ?? ''))
	const base = Number.isFinite(parsed) ? parsed : DEFAULT_FONT_SIZE
	const next = Math.min(96, Math.max(6, Math.round(base) + delta))
	editor.chain().focus().setFontSize(`${next}pt`).run()
}

/** Jalankan aksi lalu tutup menu - pola yang berulang di hampir semua butir. */
function run(close: () => void, action: () => void) {
	action()
	close()
}

function Menu({
	label,
	icon,
	children,
}: {
	label: string
	icon?: ReactNode
	children: (props: { close: () => void }) => ReactNode
}) {
	return (
		<Dropdown
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
						open
							? 'bg-[var(--overlay-active)] text-foreground'
							: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
					)}
				>
					{icon && <span className="flex h-4 w-4 items-center justify-center">{icon}</span>}
					{label}
				</button>
			)}
		>
			{children}
		</Dropdown>
	)
}

const Item = DropdownItem
