'use client'
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	CheckSquare,
	Columns2,
	Eraser,
	Indent,
	List,
	ListOrdered,
	Outdent,
	Sigma,
	TextCursor,
	Type,
} from 'lucide-react'
import { useState } from 'react'
import { CustomSpacingDialog } from '@/components/editor/custom-spacing-dialog'
import { SpacingMenuItems } from '@/components/editor/spacing-menu-items'
import { DropdownLabel, DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { indentSelection, outdentSelection } from '@/features/editor/indent'
import { convertMathInDocument, convertSelectionToMath } from '@/features/editor/math'
import { sectionRange } from '@/features/editor/section-scope'
import { ALL_PARAGRAPH_STYLES, PARAGRAPH_STYLES } from '@/features/editor/text-styles'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { FormatTextSubmenu } from './format-text-submenu'
import { Item, Menu, run } from './menu-shell'

export function FormatMenu() {
	const { editor } = useEditorInstance()
	const { state } = useDocument()
	const { setup: activeSetup } = usePageSetup()
	const hasSelection = () => Boolean(editor && !editor.state.selection.empty)
	const [spacingDialogOpen, setSpacingDialogOpen] = useState(false)

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
					<Submenu label="Gaya paragraf" icon={<TextCursor className="h-4 w-4" />}>
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
								<Item
									icon={<AlignLeft className="h-4 w-4" />}
									onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('left').run())}
								>
									Rata kiri
								</Item>
								<Item
									icon={<AlignCenter className="h-4 w-4" />}
									onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('center').run())}
								>
									Rata tengah
								</Item>
								<Item
									icon={<AlignRight className="h-4 w-4" />}
									onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('right').run())}
								>
									Rata kanan
								</Item>
								<Item
									icon={<AlignJustify className="h-4 w-4" />}
									onSelect={() => run(close, () => editor?.chain().focus().setTextAlign('justify').run())}
								>
									Rata kanan-kiri
								</Item>
							</>
						)}
					</Submenu>

					{/* ── Spasi baris & paragraf (ala Google Docs) ── */}
					<Submenu label="Spasi baris & paragraf" icon={<AlignJustify className="h-4 w-4" />}>
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
					<Submenu label="Daftar & penomoran" icon={<List className="h-4 w-4" />}>
						{() => (
							<>
								<Item
									icon={<List className="h-4 w-4" />}
									onSelect={() => run(close, () => editor?.chain().focus().toggleBulletList().run())}
								>
									Daftar butir
								</Item>
								<Item
									icon={<ListOrdered className="h-4 w-4" />}
									onSelect={() => run(close, () => editor?.chain().focus().toggleOrderedList().run())}
								>
									Daftar nomor
								</Item>
								<Item
									icon={<CheckSquare className="h-4 w-4" />}
									onSelect={() => run(close, () => editor?.chain().focus().toggleTaskList().run())}
								>
									Daftar centang
								</Item>
								<DropdownSeparator />
								<Item
									icon={<Indent className="h-4 w-4" />}
									onSelect={() => run(close, () => indentSelection(editor))}
								>
									Tambah indentasi
								</Item>
								<Item
									icon={<Outdent className="h-4 w-4" />}
									onSelect={() => run(close, () => outdentSelection(editor))}
								>
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
		</>
	)
}
