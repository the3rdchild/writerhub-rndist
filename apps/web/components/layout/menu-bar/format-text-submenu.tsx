'use client'
import {
	ALargeSmall,
	Bold,
	CaseSensitive,
	Italic,
	Minus,
	Plus,
	Strikethrough,
	Subscript,
	Superscript,
	Type,
	Underline,
} from 'lucide-react'
import { DropdownSeparator, Submenu } from '@/components/ui/dropdown'
import { applyCapitalization } from '@/features/editor/capitalization'
import { useEditorInstance } from '@/features/editor/editor-context'
import {
	FONT_CATEGORY_LABELS,
	FONT_FAMILIES,
	type FontCategory,
	fontFamilyLabel,
} from '@/features/editor/font-catalog'
import { useShortcutLabel } from '@/features/shortcuts/use-shortcuts'
import { Item, run, stepFontSize } from './menu-shell'

export function FormatTextSubmenu({ close }: { close: () => void }) {
	const { editor } = useEditorInstance()
	const keys = useShortcutLabel()
	const hasSelection = () => Boolean(editor && !editor.state.selection.empty)

	return (
		<Submenu label="Teks" icon={<Type className="h-4 w-4" />}>
			{() => (
				<>
					<Item
						icon={<Bold className="h-4 w-4" />}
						shortcut={keys('text.bold')}
						onSelect={() => run(close, () => editor?.chain().focus().toggleBold().run())}
					>
						Tebal
					</Item>
					<Item
						icon={<Italic className="h-4 w-4" />}
						shortcut={keys('text.italic')}
						onSelect={() => run(close, () => editor?.chain().focus().toggleItalic().run())}
					>
						Miring
					</Item>
					<Item
						icon={<Underline className="h-4 w-4" />}
						shortcut={keys('text.underline')}
						onSelect={() => run(close, () => editor?.chain().focus().toggleUnderline().run())}
					>
						Garis bawah
					</Item>
					<Item
						icon={<Strikethrough className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().toggleStrike().run())}
					>
						Coret
					</Item>
					<DropdownSeparator />
					<Item
						icon={<Subscript className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().toggleSubscript().run())}
					>
						Subscript
					</Item>
					<Item
						icon={<Superscript className="h-4 w-4" />}
						onSelect={() => run(close, () => editor?.chain().focus().toggleSuperscript().run())}
					>
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
														onSelect={() =>
															run(close, () => editor?.chain().focus().setFontFamily(font.value).run())
														}
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
	)
}
