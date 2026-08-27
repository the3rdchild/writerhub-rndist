'use client'

import type { Editor } from '@tiptap/react'
import { Minus, Plus } from 'lucide-react'
import { ToolbarSelect } from '@/components/ui/toolbar-select'
import {
	DEFAULT_FONT_FAMILY,
	FONT_CATEGORY_LABELS,
	FONT_FAMILIES,
	fontFamilyLabel,
} from '@/features/editor/font-catalog'
import { ZOOM_LEVELS } from '@/features/editor/page-geometry'
import { ALL_PARAGRAPH_STYLES, FONT_SIZES, PARAGRAPH_STYLES } from '@/features/editor/text-styles'
import { useSettings } from '@/features/settings/settings-context'
import { Divider, IconButton } from './toolbar-parts'
import { DEFAULT_FONT_SIZE, type ToolbarState } from './toolbar-state'

/**
 * Perbesaran, gaya paragraf, jenis dan ukuran huruf - kelompok kendali yang
 * mengubah rupa teks, dipisahkan dari deretan tombol perintah di toolbar.
 */
export function TextStyleControls({
	editor,
	disabled,
	state,
}: {
	editor: Editor | null
	disabled?: boolean
	state: ToolbarState | null
}) {
	const { settings, update } = useSettings()
	const isOff = disabled
	const active = state
	const setFontSize = (size: number) => editor?.chain().focus().setFontSize(`${size}pt`).run()

	return (
		<>
			<ToolbarSelect
				label="Perbesaran"
				width={78}
				value={settings.zoom}
				disabled={isOff}
				options={ZOOM_LEVELS.map((level) => ({ value: level, label: `${Math.round(level * 100)}%` }))}
				onChange={(zoom) => update({ zoom })}
			/>

			<Divider />

			<ToolbarSelect
				label="Gaya paragraf"
				width={128}
				value={active?.style ?? 'paragraph'}
				disabled={isOff}
				fallbackLabel={ALL_PARAGRAPH_STYLES.find((item) => item.id === active?.style)?.label}
				options={PARAGRAPH_STYLES.map((style) => ({
					value: style.id,
					label: style.label,
					previewStyle: style.previewStyle,
				}))}
				onChange={(id) => {
					const style = PARAGRAPH_STYLES.find((item) => item.id === id)
					if (editor && style) style.apply(editor)
				}}
			/>

			<Divider />

			<ToolbarSelect
				label="Jenis huruf"
				width={146}
				value={active?.fontFamily ?? DEFAULT_FONT_FAMILY}
				disabled={isOff}
				fallbackLabel={fontFamilyLabel(active?.fontFamily ?? DEFAULT_FONT_FAMILY)}
				options={FONT_FAMILIES.map((font) => ({
					value: font.value,
					label: font.label,
					group: FONT_CATEGORY_LABELS[font.category],
					previewStyle: { fontFamily: font.value },
				}))}
				onChange={(value) => editor?.chain().focus().setFontFamily(value).run()}
			/>

			<Divider />

			{/* Ukuran huruf: tombol −/+ untuk penyesuaian cepat, daftar untuk lompat jauh. */}
			<IconButton
				icon={Minus}
				label="Perkecil huruf"
				disabled={isOff}
				onClick={() => setFontSize(Math.max(6, (active?.fontSize ?? DEFAULT_FONT_SIZE) - 1))}
			/>
			<ToolbarSelect
				label="Ukuran huruf"
				width={58}
				value={active?.fontSize ?? DEFAULT_FONT_SIZE}
				disabled={isOff}
				options={FONT_SIZES.map((size) => ({ value: size, label: String(size) }))}
				onChange={setFontSize}
			/>
			<IconButton
				icon={Plus}
				label="Perbesar huruf"
				disabled={isOff}
				onClick={() => setFontSize(Math.min(96, (active?.fontSize ?? DEFAULT_FONT_SIZE) + 1))}
			/>
		</>
	)
}
