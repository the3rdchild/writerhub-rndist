'use client'

import { Extension } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { type Editor, EditorContent, useEditor } from '@tiptap/react'
import { Check, Hash, PanelTop, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSessions } from '@/features/sessions/session-context'
import { tabsRoot } from '@/features/sessions/ydoc'
import { useSettings } from '@/features/settings/settings-context'
import { furnitureExtensions, jsonToLine } from './furniture-schema'
import {
	type FurnitureSlot,
	type FurnitureVariant,
	normalizePageFurniture,
	PAGE_TOKEN,
	PAGES_TOKEN,
	type PageFurnitureLine,
} from './model'
import { ensureFurnitureFragment, PAGE_FURNITURE_KEY, setPageFurnitureForTab } from './page-furniture-ydoc'

const VARIANT_LABEL: Record<FurnitureVariant, string> = {
	default: 'Header',
	first: 'First page header',
	even: 'Even page header',
}

function labelOf(slot: FurnitureSlot, variant: FurnitureVariant): string {
	const base = slot === 'header' ? VARIANT_LABEL[variant] : VARIANT_LABEL[variant].replace('Header', 'Footer')
	return `${base} — ${variant === 'default' ? 'all pages' : variant === 'first' ? 'page 1' : 'even pages'}`
}

/**
 * Editor kecil satu slot+varian (T5), terikat langsung ke Y.XmlFragment-nya.
 * Setiap suntingan juga menurunkan baris `pageFurniture` lama supaya tampilan
 * baca-saja (berbagi, riwayat versi) dan sinkronisasi API tetap melihat isi
 * terkini dalam bentuk teks polos.
 */
export function FurnitureEditor({
	slot,
	variant,
	edge,
	offset,
	margins,
	onExit,
}: {
	slot: FurnitureSlot
	variant: FurnitureVariant
	/** Sisi lembar tempat editor menempel. */
	edge: 'top' | 'bottom'
	/** Jarak dari tepi kertas (margin header/footer, px). */
	offset: number
	/** Margin kiri/kanan lembar — editor selebar area naskah. */
	margins: { left: number; right: number }
	onExit: () => void
}) {
	const { doc, activeTabId } = useSessions()
	const { setHeadersFootersOpen } = useSettings()
	const exitRef = useRef(onExit)
	exitRef.current = onExit

	const fragment = useMemo(
		() => (activeTabId ? ensureFurnitureFragment(doc, activeTabId, { slot, variant }) : null),
		[doc, activeTabId, slot, variant],
	)

	/* Baris lama hanya ditulis ulang bila isinya memang berubah, supaya meta
	 * tidak riuh oleh suntingan jarak jauh yang tidak mengubah teksnya. */
	const syncLegacy = useCallback(
		(editor: Editor) => {
			if (!activeTabId) return
			const line = jsonToLine(editor.getJSON().content ?? [])
			const entry = tabsRoot(doc).meta.get(activeTabId)
			const raw = normalizePageFurniture(entry?.get(PAGE_FURNITURE_KEY))
			const current = raw?.[slot]?.[variant]
			if (line && current && current.text === line.text && current.align === line.align) return
			if (!line && !current) return

			const slotLines: Partial<Record<FurnitureVariant, PageFurnitureLine>> = { ...(raw?.[slot] ?? {}) }
			if (line) slotLines[variant] = line
			else delete slotLines[variant]
			setPageFurnitureForTab(doc, activeTabId, { ...(raw ?? {}), [slot]: slotLines })
		},
		[doc, activeTabId, slot, variant],
	)

	const editor = useEditor(
		{
			immediatelyRender: false,
			extensions: [
				...furnitureExtensions(slot === 'header' ? 'Header…' : 'Footer…'),
				Collaboration.configure({
					document: doc,
					fragment: fragment ?? doc.getXmlFragment('furniture-inactive'),
				}),
				Extension.create({
					name: 'furnitureEscape',
					addKeyboardShortcuts() {
						return {
							Escape: () => {
								exitRef.current()
								return true
							},
						}
					},
				}),
			],
			editorProps: {
				attributes: {
					class: 'furniture-body focus:outline-none',
					spellcheck: 'false',
				},
			},
			onUpdate: ({ editor: instance }) => syncLegacy(instance),
		},
		[fragment],
	)

	/* Autofokus saat masuk mode sunting; fokus kembali ke kanvas saat keluar. */
	useEffect(
		function focusOnMount() {
			const timer = window.setTimeout(() => editor?.commands.focus('end'), 0)
			return () => window.clearTimeout(timer)
		},
		[editor],
	)

	if (!fragment) return null

	const insert = (token: string) => editor?.chain().focus().insertContent(token).run()

	return (
		<div
			className="furniture-edit-box absolute z-20"
			style={{
				[edge]: offset,
				marginLeft: margins.left,
				marginRight: margins.right,
			}}
		>
			<div
				className="furniture-edit-pill"
				role="toolbar"
				aria-label={labelOf(slot, variant)}
				style={{ bottom: 'calc(100% + 6px)' }}
			>
				<PanelTop className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
				<span className="furniture-edit-label">{labelOf(slot, variant)}</span>
				<button
					type="button"
					className="furniture-edit-btn"
					onClick={() => insert(PAGE_TOKEN)}
					title="Insert page number"
				>
					<Hash className="h-3.5 w-3.5" aria-hidden="true" />
					Page
				</button>
				<button
					type="button"
					className="furniture-edit-btn"
					onClick={() => insert(PAGES_TOKEN)}
					title="Insert total page count"
				>
					<Hash className="h-3.5 w-3.5" aria-hidden="true" />
					Pages
				</button>
				<button
					type="button"
					className="furniture-edit-btn"
					onClick={() => setHeadersFootersOpen(true)}
					title="Headers & footers options"
				>
					<Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
					Options
				</button>
				<button type="button" className="furniture-edit-btn furniture-edit-btn--done" onClick={onExit}>
					<Check className="h-3.5 w-3.5" aria-hidden="true" />
					Done
				</button>
			</div>
			<EditorContent editor={editor} className="furniture-edit-content" />
		</div>
	)
}
