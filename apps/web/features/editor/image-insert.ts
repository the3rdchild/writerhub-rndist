'use client'

import { type Editor, Extension } from '@tiptap/core'
import { Fragment, type Node as PMNode, Slice } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { dropPoint } from '@tiptap/pm/transform'
import { showNotice } from '@/lib/notice'
import { CAPTION_MAX_LEVEL, CAPTION_MIN_LEVEL, FIGURE_CAPTION } from './caption-kind'

/*
 * Gambar: sisip lewat berkas (seret-lepas, tempel), dialog sisip/ganti/teks
 * alt, keterangan, dan ukuran cepat. Dulu berkas yang diseret atau ditempel
 * diabaikan tanpa pesan (uji editor 2 Okt, OBJ-9), dan toolbar gambar hanya
 * berisi perataan dan hapus (OBJ-10).
 */

/** Batas ukuran berkas gambar - gambar disematkan sebagai data URI di naskah. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function imageFilesOf(data: DataTransfer | null | undefined): File[] {
	return data ? [...data.files].filter((file) => file.type.startsWith('image/')) : []
}

/** Ukuran hakiki gambar, atau null bila gagal dimuat. */
export function measureImage(src: string): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const image = new Image()
		image.onload = () =>
			resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null)
		image.onerror = () => resolve(null)
		image.src = src
	})
}

export function readImageFile(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
		reader.readAsDataURL(file)
	})
}

/**
 * Sisipkan berkas gambar di posisi `at` (seret-lepas) atau di kursor (tempel).
 * Berkas di atas batas ditolak dengan pemberitahuan, bukan diam-diam.
 */
export async function insertImageFiles(editor: Editor, files: readonly File[], at?: number): Promise<void> {
	const tooLarge = files.filter((file) => file.size > MAX_IMAGE_BYTES)
	if (tooLarge.length > 0) {
		const names = tooLarge.map((file) => file.name || 'image').join(', ')
		showNotice(`${names} ${tooLarge.length === 1 ? 'is' : 'are'} larger than 5 MB and wasn't inserted.`)
	}
	const sources = await Promise.allSettled(
		files.filter((file) => file.size <= MAX_IMAGE_BYTES).map(readImageFile),
	)
	const srcs = sources.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
	if (srcs.length === 0 || editor.isDestroyed) return

	if (at === undefined) {
		for (const src of srcs) editor.chain().focus().setImage({ src }).run()
		return
	}
	const { state } = editor
	const type = state.schema.nodes.image
	if (!type) return
	const nodes = srcs.map((src) => type.create({ src }))
	const point = dropPoint(state.doc, at, new Slice(Fragment.fromArray(nodes), 0, 0)) ?? at
	editor
		.chain()
		.focus()
		.insertContentAt(
			point,
			nodes.map((node) => node.toJSON()),
		)
		.run()
}

/** HTML tempelan yang sudah membawa gambarnya sendiri (dari web, Docs) diurus penempel HTML. */
function htmlCarriesImages(data: DataTransfer | null): boolean {
	const html = data?.getData('text/html') ?? ''
	return /<img\b[^>]*\bsrc=["']?(?:https?:|data:)/i.test(html)
}

export const ImageFileDrop = Extension.create({
	name: 'imageFileDrop',
	// Sebelum penempel Markdown: berkas di papan klip kadang disertai teks namanya.
	priority: 110,

	addProseMirrorPlugins() {
		const editor = this.editor
		return [
			new Plugin({
				key: new PluginKey('imageFileDrop'),
				props: {
					handlePaste(_view, event) {
						const files = imageFilesOf(event.clipboardData)
						if (files.length === 0 || htmlCarriesImages(event.clipboardData)) return false
						event.preventDefault()
						void insertImageFiles(editor, files)
						return true
					},
					handleDrop(view, event, _slice, moved) {
						if (moved) return false
						const files = imageFilesOf(event.dataTransfer)
						if (files.length === 0) return false
						event.preventDefault()
						const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
						void insertImageFiles(editor, files, at ?? view.state.selection.from)
						return true
					},
				},
			}),
		]
	},
})

// ── dialog ─────────────────────────────────────────────────────────────────

const DIALOG_EVENT = 'writer-hub:image-dialog'

export interface ImageDialogRequest {
	editor: Editor
	/** insert: sisip baru; replace: ganti sumber gambar terpilih; alt: sunting teks alt. */
	mode: 'insert' | 'replace' | 'alt'
	alt: string
}

/** Buka dialog gambar (dipasang di `ImageDialog`). */
export function promptForImage(editor: Editor, mode: ImageDialogRequest['mode'] = 'insert'): void {
	const alt = mode === 'insert' ? '' : ((editor.getAttributes('image').alt as string | null) ?? '')
	window.dispatchEvent(new CustomEvent<ImageDialogRequest>(DIALOG_EVENT, { detail: { editor, mode, alt } }))
}

export function onImageDialogRequest(listener: (request: ImageDialogRequest) => void): () => void {
	const handler = (event: Event) => listener((event as CustomEvent<ImageDialogRequest>).detail)
	window.addEventListener(DIALOG_EVENT, handler)
	return () => window.removeEventListener(DIALOG_EVENT, handler)
}

function selectedImage(editor: Editor): { pos: number; attrs: Record<string, unknown> } | null {
	const { selection } = editor.state
	if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null
	return { pos: selection.from, attrs: selection.node.attrs }
}

/**
 * Ganti sumber gambar terpilih. Lebarnya dipertahankan dan tingginya mengikuti
 * rasio gambar baru, supaya tata letak di sekitarnya tidak melompat.
 */
export async function replaceSelectedImage(editor: Editor, src: string, alt?: string): Promise<void> {
	const target = selectedImage(editor)
	if (!target) return
	const size = await measureImage(src)
	const width = typeof target.attrs.width === 'number' ? target.attrs.width : null
	const height = width && size ? Math.round((width * size.height) / size.width) : null
	if (editor.isDestroyed) return
	editor
		.chain()
		.focus()
		.command(({ tr }) => {
			tr.setNodeMarkup(target.pos, undefined, {
				...target.attrs,
				src,
				alt: alt ?? target.attrs.alt,
				height: width ? height : target.attrs.height,
			})
			tr.setSelection(NodeSelection.create(tr.doc, target.pos))
			return true
		})
		.run()
}

export function setSelectedImageAlt(editor: Editor, alt: string): boolean {
	const target = selectedImage(editor)
	if (!target) return false
	return editor
		.chain()
		.focus()
		.command(({ tr }) => {
			tr.setNodeMarkup(target.pos, undefined, { ...target.attrs, alt: alt.trim() || null })
			tr.setSelection(NodeSelection.create(tr.doc, target.pos))
			return true
		})
		.run()
}

// ── keterangan ─────────────────────────────────────────────────────────────

function isFigureCaption(node: PMNode): boolean {
	const level = node.attrs.level as number
	return (
		node.type.name === 'heading' &&
		level >= CAPTION_MIN_LEVEL &&
		level <= CAPTION_MAX_LEVEL &&
		FIGURE_CAPTION.test(node.textContent)
	)
}

/** Keterangan gambar tepat sesudah gambar di `imagePos`, atau null. */
export function captionAfterImage(doc: PMNode, imagePos: number): { pos: number; node: PMNode } | null {
	const image = doc.nodeAt(imagePos)
	if (!image) return null
	const pos = imagePos + image.nodeSize
	const next = doc.nodeAt(pos)
	return next && isFigureCaption(next) ? { pos, node: next } : null
}

/** Nomor keterangan berikutnya untuk gambar di `imagePos`: keterangan gambar sebelumnya + 1. */
export function nextFigureNumber(doc: PMNode, imagePos: number): number {
	let earlier = 0
	doc.nodesBetween(0, imagePos, (node) => {
		if (isFigureCaption(node)) earlier++
		return !node.isTextblock
	})
	return earlier + 1
}

/**
 * Keterangan gambar: judul tingkat 7 "Gambar N. " tepat di bawah gambar, jadi
 * ikut terdaftar di Daftar gambar dan menjadi Heading 7 di Word. Bila gambar
 * sudah berketerangan, kursor dibawa ke ujung keterangannya.
 */
export function addOrEditImageCaption(editor: Editor): boolean {
	const target = selectedImage(editor)
	if (!target) return false
	const { doc } = editor.state
	const existing = captionAfterImage(doc, target.pos)
	if (existing) {
		return editor
			.chain()
			.focus()
			.setTextSelection(existing.pos + existing.node.nodeSize - 1)
			.run()
	}
	const image = doc.nodeAt(target.pos)
	if (!image) return false
	const after = target.pos + image.nodeSize
	const text = `Gambar ${nextFigureNumber(doc, target.pos)}. `
	return editor
		.chain()
		.focus()
		.insertContentAt(after, {
			type: 'heading',
			attrs: { level: CAPTION_MIN_LEVEL },
			content: [{ type: 'text', text }],
		})
		.setTextSelection(after + 1 + text.length)
		.run()
}

// ── ukuran cepat ───────────────────────────────────────────────────────────

/** Lebar kolom tempat gambar berada - sama dengan batas seret di node view. */
function columnWidthOf(editor: Editor, pos: number): number | null {
	const dom = editor.view.nodeDOM(pos) as HTMLElement | null
	const wrapper = dom?.matches?.('.resizable-image-wrapper')
		? dom
		: dom?.querySelector?.<HTMLElement>('.resizable-image-wrapper')
	if (!wrapper) return null
	const style = getComputedStyle(wrapper)
	return wrapper.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
}

/** Lebar gambar terpilih menjadi `fraction` dari lebar kolom, atau ukuran aslinya (dibatasi kolom). */
export async function resizeSelectedImage(editor: Editor, fraction: number | 'original'): Promise<boolean> {
	const target = selectedImage(editor)
	if (!target) return false
	const column = columnWidthOf(editor, target.pos)
	const natural = await measureImage(String(target.attrs.src ?? ''))
	if (!column || !natural || editor.isDestroyed) return false
	const width = Math.round(fraction === 'original' ? Math.min(natural.width, column) : column * fraction)
	const height = Math.round((width * natural.height) / natural.width)
	return editor
		.chain()
		.focus()
		.command(({ tr }) => {
			tr.setNodeMarkup(target.pos, undefined, { ...target.attrs, width, height })
			tr.setSelection(NodeSelection.create(tr.doc, target.pos))
			return true
		})
		.run()
}
