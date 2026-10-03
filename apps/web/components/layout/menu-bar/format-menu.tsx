'use client'
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	CheckSquare,
	Columns2,
	Eraser,
	Hash,
	Indent,
	List,
	ListOrdered,
	ListPlus,
	Outdent,
	PanelTop,
	RotateCcw,
	Sigma,
	TextCursor,
	Type,
} from 'lucide-react'
import { useState } from 'react'
import { ColumnOptionsDialog } from '@/components/editor/column-options-dialog'
import { CustomSpacingDialog } from '@/components/editor/custom-spacing-dialog'
import { ListStartField } from '@/components/editor/list-start-field'
import { SpacingMenuItems } from '@/components/editor/spacing-menu-items'
import { DropdownLabel, DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { indentSelection, outdentSelection } from '@/features/editor/indent'
import {
	continueNumbering,
	NUMBERING_STYLES,
	orderedListAt,
	previousOrderedList,
	restartNumbering,
	setNumberingType,
} from '@/features/editor/list-numbering'
import { convertMathInDocument, insertOrConvertMath } from '@/features/editor/math'
import { columnRegionAt } from '@/features/editor/section-break'
import { sectionRange } from '@/features/editor/section-scope'
import { ALL_PARAGRAPH_STYLES, PARAGRAPH_STYLES } from '@/features/editor/text-styles'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSettings } from '@/features/settings/settings-context'
import { FormatTextSubmenu } from './format-text-submenu'
import { Item, Menu, run } from './menu-shell'

export function FormatMenu() {
	const { editor } = useEditorInstance()
	const { state } = useDocument()
	const { setup: activeSetup } = usePageSetup()
	const { settings, setHeadersFootersOpen, setPageNumbersOpen } = useSettings()
	const hasSelection = () => Boolean(editor && !editor.state.selection.empty)
	/* Kursor di dalam wilayah berkolom: "Two/Three columns" mengganti jumlah
	 * kolom wilayah itu, jadi butirnya tidak perlu seleksi. */
	const inColumns = () =>
		Boolean(editor && columnRegionAt(editor.state.doc, editor.state.selection.from, activeSetup))
	const canContinueNumbering = () => {
		const list = editor ? orderedListAt(editor.state.selection.$from) : null
		return Boolean(editor && list && previousOrderedList(editor.state.doc, list))
	}
	const [spacingDialogOpen, setSpacingDialogOpen] = useState(false)
	const [columnsDialogOpen, setColumnsDialogOpen] = useState(false)

	return (
		<>
			<Menu label="Format" icon={<Type className="h-4 w-4" />}>
				{({ close }) => (
					<>
						{/* ── Teks: gaya huruf, jenis & ukuran, kapitalisasi ──
			    Warna sengaja tidak ada di sini: palet 24 warna jadi 24 baris
			    menu yang payah dibaca, sementara toolbar sudah punya kisi
			    swatch yang jauh lebih pas untuk itu. */}
						<FormatTextSubmenu close={close} />

						{/* ── Gaya paragraf ── */}
						<Submenu label="Paragraph style" icon={<TextCursor className="h-4 w-4" />}>
							{() => {
								const activeStyle = editor ? ALL_PARAGRAPH_STYLES.find((s) => s.isActive(editor)) : undefined
								const highLevel =
									activeStyle && !PARAGRAPH_STYLES.some((s) => s.id === activeStyle.id)
										? activeStyle
										: undefined
								return (
									<>
										{highLevel && (
											<Item key={highLevel.id} active disabled>
												{highLevel.label} (keyboard shortcut)
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
						<Submenu label="Alignment" icon={<AlignLeft className="h-4 w-4" />}>
							{() => (
								<>
									<Item
										icon={<AlignLeft className="h-4 w-4" />}
										onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('left').run())}
									>
										Align left
									</Item>
									<Item
										icon={<AlignCenter className="h-4 w-4" />}
										onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('center').run())}
									>
										Align center
									</Item>
									<Item
										icon={<AlignRight className="h-4 w-4" />}
										onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('right').run())}
									>
										Align right
									</Item>
									<Item
										icon={<AlignJustify className="h-4 w-4" />}
										onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('justify').run())}
									>
										Justify
									</Item>
								</>
							)}
						</Submenu>

						{/* ── Spasi baris & paragraf (ala Google Docs) ── */}
						<Submenu label="Line & paragraph spacing" icon={<AlignJustify className="h-4 w-4" />}>
							{() => (
								<SpacingMenuItems
									editor={editor}
									close={close}
									onOpenCustomSpacing={() => {
										close()
										setSpacingDialogOpen(true)
									}}
								/>
							)}
						</Submenu>

						{/* ── Daftar & penomoran ── */}
						<Submenu label="Lists & numbering" icon={<List className="h-4 w-4" />}>
							{() => (
								<>
									<Item
										icon={<List className="h-4 w-4" />}
										onSelect={() => run(close, () => editor?.chain().focus().toggleBulletList().run())}
									>
										Bulleted list
									</Item>
									<Item
										icon={<ListOrdered className="h-4 w-4" />}
										onSelect={() => run(close, () => editor?.chain().focus().toggleOrderedList().run())}
									>
										Numbered list
									</Item>
									<Item
										icon={<CheckSquare className="h-4 w-4" />}
										onSelect={() => run(close, () => editor?.chain().focus().toggleTaskList().run())}
									>
										Checklist
									</Item>
									<DropdownSeparator />
									{/* Gaya, mulai ulang, dan lanjutkan nomor (TKS-10). */}
									<Submenu label="Numbering style" icon={<ListOrdered className="h-4 w-4" />}>
										{() => (
											<>
												{NUMBERING_STYLES.map((style) => (
													<Item
														key={style.type}
														active={editor?.isActive('orderedList', { type: style.type }) ?? false}
														onSelect={() => run(close, () => editor && setNumberingType(editor, style.type))}
													>
														{style.label}
													</Item>
												))}
											</>
										)}
									</Submenu>
									<Item
										icon={<RotateCcw className="h-4 w-4" />}
										disabled={!editor?.isActive('orderedList')}
										onSelect={() => run(close, () => editor && restartNumbering(editor))}
									>
										Restart numbering
									</Item>
									<Item
										icon={<ListPlus className="h-4 w-4" />}
										disabled={!canContinueNumbering()}
										onSelect={() => run(close, () => editor && continueNumbering(editor))}
									>
										Continue numbering
									</Item>
									<Submenu label="Set numbering value" icon={<Hash className="h-4 w-4" />}>
										{() => <ListStartField editor={editor} onDone={close} />}
									</Submenu>
									<DropdownSeparator />
									<Item
										icon={<Indent className="h-4 w-4" />}
										onSelect={() => run(close, () => indentSelection(editor))}
									>
										Increase indent
									</Item>
									<Item
										icon={<Outdent className="h-4 w-4" />}
										onSelect={() => run(close, () => outdentSelection(editor))}
									>
										Decrease indent
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
											disabled={!hasSelection() && !inColumns()}
											onSelect={() => run(close, () => editor?.chain().focus().setColumns(count).run())}
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
													editor.chain().focus().applySectionColumns({ count }, range, activeSetup).run()
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
									<Item
										icon={<Columns2 className="h-4 w-4" />}
										onSelect={() => {
											close()
											setColumnsDialogOpen(true)
										}}
									>
										More column options…
									</Item>
								</>
							)}
						</Submenu>
						{/* ── Header & footer ──
			    Margin, varian halaman pertama/genap, dan penomoran per bagian
			    (termasuk angka romawi untuk halaman depan). */}
						<Item
							icon={<PanelTop className="h-4 w-4" />}
							onSelect={() => run(close, () => setHeadersFootersOpen(true))}
						>
							Headers &amp; footers…
						</Item>
						<Item
							icon={<Hash className="h-4 w-4" />}
							onSelect={() => run(close, () => setPageNumbersOpen(true))}
						>
							Page numbers…
						</Item>
						{/* ── Rumus ── */}
						<Submenu label="Formula" icon={<Sigma className="h-4 w-4" />}>
							{() => (
								<>
									<Item
										icon={<Sigma className="h-4 w-4" />}
										disabled={!editor}
										onSelect={() => run(close, () => editor && insertOrConvertMath(editor, false))}
									>
										{editor?.state.selection.empty === false ? 'Make formula' : 'Insert formula…'}
									</Item>
									<Item
										icon={<Sigma className="h-4 w-4" />}
										disabled={!editor}
										onSelect={() => run(close, () => editor && insertOrConvertMath(editor, true))}
									>
										{editor?.state.selection.empty === false ? 'Make block formula' : 'Insert block formula…'}
									</Item>
									<DropdownSeparator />
									<Item onSelect={() => run(close, () => editor && convertMathInDocument(editor))}>
										Convert all $formulas$ in the document
									</Item>
								</>
							)}
						</Submenu>

						<DropdownSeparator />
						<Item
							icon={<Eraser className="h-4 w-4" />}
							onSelect={() => run(close, () => editor?.chain().focus().unsetAllMarks().clearNodes().run())}
						>
							Clear formatting
						</Item>
					</>
				)}
			</Menu>
			<CustomSpacingDialog
				editor={editor}
				open={spacingDialogOpen}
				onClose={() => setSpacingDialogOpen(false)}
			/>
			<ColumnOptionsDialog
				editor={editor}
				open={columnsDialogOpen}
				onClose={() => setColumnsDialogOpen(false)}
				unit={settings.measurementUnit}
				baseSetup={activeSetup}
			/>
		</>
	)
}
