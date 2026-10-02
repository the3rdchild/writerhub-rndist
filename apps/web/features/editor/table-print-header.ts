import type { EditorView } from '@tiptap/pm/view'

/*
 * Baris kepala tabel yang berulang di kertas (TBL-8).
 *
 * Di kanvas kepala tabel diulang paginasi sendiri (`tr.table-header-repeat`
 * di puncak lembar lanjutan). Di kertas peramban yang memenggal halaman, dan
 * peramban hanya mengulang `<thead>` - padahal baris kepala TipTap duduk di
 * `<tbody>`. Sesaat sebelum mencetak (`beforeprint`, juga dipicu `page.pdf()`
 * perender ekspor) tiap tabel yang meminta kepalanya diulang mendapat
 * `<thead>` berisi salinan baris kepalanya, dan baris aslinya disembunyikan
 * CSS cetak - jadi kepala itu tercetak sekali di awal tabel dan sekali di tiap
 * halaman lanjutannya. Sesudah `afterprint` semuanya dikembalikan.
 *
 * Ini satu-satunya tempat DOM tabel milik ProseMirror disentuh langsung, jadi
 * pengamat DOM-nya dihentikan selama penyuntingan kecil itu: tanpa itu
 * ProseMirror membaca `<thead>` sebagai isi baru dan menyisipkannya ke naskah.
 */

export const PRINT_HEADER_SOURCE_CLASS = 'table-header-print-source'

interface DomObserverLike {
	stop(): void
	start(): void
}

function paused(view: EditorView, change: () => void): void {
	const observer = (view as unknown as { domObserver?: DomObserverLike }).domObserver
	observer?.stop()
	try {
		change()
	} finally {
		observer?.start()
	}
}

export function attachTablePrintHeaders(view: EditorView): () => void {
	let inserted: { thead: HTMLTableSectionElement; source: HTMLElement }[] = []

	const remove = () => {
		for (const { thead, source } of inserted) {
			thead.remove()
			source.classList.remove(PRINT_HEADER_SOURCE_CLASS)
		}
		inserted = []
	}

	const before = () => {
		if (view.isDestroyed) return
		paused(view, () => {
			remove()
			view.state.doc.descendants((node, pos) => {
				if (node.type.name !== 'table') return true
				const first = node.firstChild
				if (node.attrs.repeatHeader === false || first?.firstChild?.type.name !== 'tableHeader') return true
				const row = view.nodeDOM(pos + 1)
				const table = row instanceof HTMLTableRowElement ? row.closest('table') : null
				if (!(row instanceof HTMLTableRowElement) || !table || table.tHead) return true
				const copy = row.cloneNode(true) as HTMLElement
				copy.removeAttribute('id')
				for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id')
				const thead = table.createTHead()
				thead.appendChild(copy)
				row.classList.add(PRINT_HEADER_SOURCE_CLASS)
				inserted.push({ thead, source: row })
				return true
			})
		})
	}
	const after = () => {
		if (!view.isDestroyed) paused(view, remove)
	}

	window.addEventListener('beforeprint', before)
	window.addEventListener('afterprint', after)
	return () => {
		window.removeEventListener('beforeprint', before)
		window.removeEventListener('afterprint', after)
		if (!view.isDestroyed) paused(view, remove)
	}
}
