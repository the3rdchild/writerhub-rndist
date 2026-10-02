import type { Schema } from '@tiptap/pm/model'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import { yFragmentToProseMirrorJSON } from '@writer-hub/shared/collab-json'
import { updateYFragment } from 'y-prosemirror'
import type * as Y from 'yjs'

import { COLLAB_MIRROR_ORIGIN } from './origins'

export { COLLAB_MIRROR_ORIGIN }

/**
 * Menyalin naskah tab kolaboratif ke fragmen tab yang sama di Y.Doc besar,
 * yang tetap menjadi sumber pratinjau, ekspor, riwayat lokal, dan daftar
 * dokumen. Alirannya satu arah (Y.Doc tab → Y.Doc besar), jadi tidak ada gema:
 * editor terikat ke Y.Doc tab, dan tidak ada yang menulis balik dari fragmen
 * besar.
 *
 * Disalin lewat diff (`updateYFragment`), bukan hapus-lalu-tulis-ulang: Y.Doc
 * besar menyimpan setiap item yang pernah ada, dan menulis ulang seluruh
 * naskah setiap beberapa detik membuatnya membengkak.
 *
 * Naskah dibaca lewat konverter tanpa skema, bukan
 * `yXmlFragmentToProseMirrorRootNode`: yang terakhir itu MENGHAPUS simpul yang
 * tidak sah dari Y.Doc sumbernya - di sini sumbernya Y.Doc yang tersinkron ke
 * semua kolaborator.
 *
 * @returns false bila naskahnya tidak sah menurut skema (cermin dilewati)
 */
export function mirrorFragment(
	source: Y.XmlFragment,
	target: Y.Doc,
	targetField: string,
	schema: Schema,
	origin: unknown = COLLAB_MIRROR_ORIGIN,
): boolean {
	let node: ReturnType<Schema['nodeFromJSON']>
	try {
		node = schema.nodeFromJSON(yFragmentToProseMirrorJSON(source))
	} catch {
		return false
	}
	target.transact(() => {
		updateYFragment(target, target.getXmlFragment(targetField), node, {
			mapping: new Map(),
			isOMark: new Map(),
		})
	}, origin)
	return true
}

export interface FragmentMirror {
	/** Salin sekarang, mis. sebelum ekspor atau saat tab ditinggalkan. */
	flush(): void
	destroy(): void
}

export interface FragmentMirrorOptions {
	/** Y.Doc tab kolaboratif. */
	source: Y.Doc
	/** Y.Doc besar peramban. */
	target: Y.Doc
	/** Id tab LOKAL - nama fragmennya di Y.Doc besar. */
	targetField: string
	schema: Schema
	/** Jeda tenang sebelum menyalin; menyalin naskah besar butuh puluhan ms. */
	delayMs?: number
	/** Batas tunda selama suntingan terus mengalir. */
	maxDelayMs?: number
	origin?: unknown
}

export function createFragmentMirror({
	source,
	target,
	targetField,
	schema,
	delayMs = 800,
	maxDelayMs = 4000,
	origin = COLLAB_MIRROR_ORIGIN,
}: FragmentMirrorOptions): FragmentMirror {
	let idle: ReturnType<typeof setTimeout> | null = null
	let deadline: ReturnType<typeof setTimeout> | null = null
	let destroyed = false

	const clear = () => {
		if (idle) clearTimeout(idle)
		if (deadline) clearTimeout(deadline)
		idle = null
		deadline = null
	}
	const flush = () => {
		clear()
		if (destroyed) return
		mirrorFragment(source.getXmlFragment(COLLAB_FRAGMENT), target, targetField, schema, origin)
	}
	const onUpdate = () => {
		if (idle) clearTimeout(idle)
		idle = setTimeout(flush, delayMs)
		if (!deadline) deadline = setTimeout(flush, maxDelayMs)
	}
	source.on('update', onUpdate)

	return {
		flush,
		destroy() {
			clear()
			destroyed = true
			source.off('update', onUpdate)
		},
	}
}
