import type { Editor } from '@tiptap/react'
import type { PageSetup } from '@writer-hub/shared'
import { BODY_NUMBERING, FRONT_NUMBERING, placeAcademicNumbering } from '@/features/editor/academic-numbering'
import type {
	FurnitureSlot,
	FurnitureVariant,
	PageFurniture,
	PageFurnitureLine,
} from '@/features/editor/page-furniture/model'

export interface NumberingContext {
	editor: Editor
	setup: PageSetup
	setPageSetup: (setup: PageSetup, scope: 'document' | 'tab') => void
	setFirstPageSeparate: (separate: boolean) => { ok: boolean; message: string }
	furniture: () => PageFurniture | null
	setFurnitureLine: (
		slot: FurnitureSlot,
		variant: FurnitureVariant,
		line: PageFurnitureLine | null,
	) => { ok: boolean; message: string }
}

export type AcademicNumberingResult =
	| { ok: true; front: boolean; message: string }
	| { ok: false; front: false; message: string }

/* Baris header/footer yang isinya hanya nomor: ia menutupi letak pedoman. */
const BARE_NUMBER = /^\s*\{page\}\s*$/

/**
 * Penomoran pedoman karya ilmiah untuk tab aktif - dipakai alat
 * `set_page_numbering` (preset "academic") dan pemasangan otomatis sesudah
 * giliran AI. Lihat `academic-numbering.ts` untuk bentuknya.
 */
export function applyAcademicNumbering(context: NumberingContext): AcademicNumberingResult {
	const { editor } = context
	const { tr, schema } = editor.state
	const placement = placeAcademicNumbering(tr, schema)
	if (!placement.ok) {
		return {
			ok: false,
			front: false,
			message:
				'The document has no level-1 "BAB I" / "PENDAHULUAN" heading yet, so there is no place where arabic numbering starts. Write it first; the numbering is set automatically afterwards.',
		}
	}
	if (tr.docChanged) editor.view.dispatch(tr)

	context.setPageSetup(
		{ ...context.setup, pageNumbering: placement.front ? FRONT_NUMBERING : BODY_NUMBERING },
		'tab',
	)
	if (placement.cover) context.setFirstPageSeparate(true)

	const furniture = context.furniture()
	const cleared: string[] = []
	for (const slot of ['header', 'footer'] as const) {
		for (const variant of ['default', 'first', 'even'] as const) {
			const line = furniture?.[slot]?.[variant]
			if (line && BARE_NUMBER.test(line.text)) {
				context.setFurnitureLine(slot, variant, null)
				cleared.push(`${variant} ${slot}`)
			}
		}
	}

	return {
		ok: true,
		front: placement.front,
		message: [
			placement.front
				? `Page numbering set per Indonesian academic guidelines: ${placement.cover ? 'the cover is counted as i but carries no number, ' : ''}front matter in lower-case roman numerals at the bottom center, and from the first chapter arabic numbers restarting at 1 - bottom center on chapter-opening pages, top right on the others.`
				: 'Page numbering set per Indonesian academic guidelines: arabic numbers from 1, bottom center on chapter-opening pages, top right on the others. When front matter is added before BAB I it gets roman numerals automatically.',
			cleared.length > 0
				? `Removed header/footer lines that only held a page number (${cleared.join(', ')}).`
				: '',
			'Do not type page numbers into the document and do not add {page} to headers or footers for this.',
		]
			.filter(Boolean)
			.join(' '),
	}
}
