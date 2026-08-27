'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Check } from 'lucide-react'
import { DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { blockKeepAt, type BlockKeepValues } from '@/features/editor/block-keep'
import { blockSpacingAt } from '@/features/editor/block-spacing-at'
import {
	ADD_SPACE_PT,
	DEFAULT_LINE_SPACING,
	KEEP_OPTIONS,
	LINE_SPACING_OPTIONS,
} from '@/features/editor/spacing-options'
import { ptToPx } from '@/features/editor/spacing-units'

interface SpacingState {
	lineHeight: string
	spaceBefore: number
	spaceAfter: number
	keep: BlockKeepValues
}

/**
 * Isi menu "Spasi baris & paragraf" ala Google Docs, dipakai bersama oleh
 * dropdown toolbar dan submenu di menu Format. Berlangganan keadaan editor
 * sendiri supaya kedua tuan rumah tinggal merendernya.
 */
export function SpacingMenuItems({
	editor,
	close,
	onOpenCustomSpacing,
}: {
	editor: Editor | null
	close: () => void
	onOpenCustomSpacing: () => void
}) {
	const current = useEditorState({
		editor,
		selector: ({ editor: instance }): SpacingState | null => {
			if (!instance || instance.isDestroyed) return null
			const spacing = blockSpacingAt(instance)
			return {
				lineHeight: spacing.lineHeight ?? DEFAULT_LINE_SPACING,
				spaceBefore: spacing.spaceBefore,
				spaceAfter: spacing.spaceAfter,
				keep: blockKeepAt(instance),
			}
		},
	})

	const lineHeight = current?.lineHeight ?? DEFAULT_LINE_SPACING

	return (
		<>
			{LINE_SPACING_OPTIONS.map((option) => {
				const active = lineHeight === option.value
				return (
					<DropdownItem
						key={option.value}
						icon={active ? <Check className="h-4 w-4" /> : undefined}
						onSelect={() => {
							editor?.chain().focus().setLineHeight(option.value).run()
							close()
						}}
					>
						{option.label}
					</DropdownItem>
				)
			})}

			<DropdownSeparator />

			{/* Beralih antara "Tambah" dan "Hapus" sesuai spasi yang sedang berlaku,
			    persis seperti butir Add/Remove space di Google Docs. */}
			<DropdownItem
				onSelect={() => {
					const has = (current?.spaceBefore ?? 0) > 0
					editor
						?.chain()
						.focus()
						.setBlockSpace({ before: has ? 0 : ptToPx(ADD_SPACE_PT) })
						.run()
					close()
				}}
			>
				{(current?.spaceBefore ?? 0) > 0
					? 'Hapus spasi sebelum paragraf'
					: 'Tambah spasi sebelum paragraf'}
			</DropdownItem>
			<DropdownItem
				onSelect={() => {
					const has = (current?.spaceAfter ?? 0) > 0
					editor
						?.chain()
						.focus()
						.setBlockSpace({ after: has ? 0 : ptToPx(ADD_SPACE_PT) })
						.run()
					close()
				}}
			>
				{(current?.spaceAfter ?? 0) > 0 ? 'Hapus spasi sesudah paragraf' : 'Tambah spasi sesudah paragraf'}
			</DropdownItem>

			<DropdownSeparator />

			<DropdownItem onSelect={onOpenCustomSpacing}>Spasi kustom…</DropdownItem>

			<DropdownSeparator />

			{KEEP_OPTIONS.map((option) => {
				const active = current?.keep[option.key] ?? false
				return (
					<DropdownItem
						key={option.key}
						icon={active ? <Check className="h-4 w-4" /> : undefined}
						onSelect={() => {
							editor
								?.chain()
								.focus()
								.setBlockKeep({ [option.key]: !active })
								.run()
							close()
						}}
					>
						{option.label}
					</DropdownItem>
				)
			})}
		</>
	)
}
