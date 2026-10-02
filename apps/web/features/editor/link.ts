'use client'

import type { Editor } from '@tiptap/core'

/*
 * Tautan: dialog sendiri (bukan `window.prompt`), sisip tanpa seleksi, dan
 * URL yang dinormalisasi. Dulu Ctrl+K tanpa seleksi tidak menyisipkan apa pun,
 * "contoh.id" tersimpan sebagai alamat relatif ke aplikasi, dan tautan tidak
 * bisa dibuka dari editor (uji editor 2 Okt, TKS-11).
 */

const OPEN_EVENT = 'writer-hub:open-link-dialog'

export interface LinkDialogRequest {
	editor: Editor
	href: string
	text: string
	/** Ada teks terpilih atau tautan yang sedang disunting - teksnya tidak diganti. */
	hasRange: boolean
}

/** Buka dialog tautan untuk seleksi saat ini (dipasang di `LinkDialog`). */
export function promptForLink(editor: Editor): void {
	editor.commands.extendMarkRange('link')
	const { from, to, empty } = editor.state.selection
	const request: LinkDialogRequest = {
		editor,
		href: (editor.getAttributes('link').href as string | undefined) ?? '',
		text: editor.state.doc.textBetween(from, to, ' '),
		hasRange: !empty,
	}
	window.dispatchEvent(new CustomEvent<LinkDialogRequest>(OPEN_EVENT, { detail: request }))
}

export function onLinkDialogRequest(listener: (request: LinkDialogRequest) => void): () => void {
	const handler = (event: Event) => listener((event as CustomEvent<LinkDialogRequest>).detail)
	window.addEventListener(OPEN_EVENT, handler)
	return () => window.removeEventListener(OPEN_EVENT, handler)
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/

/** "contoh.id" → "https://contoh.id", "nama@contoh.id" → "mailto:…"; skema, path, dan anchor dibiarkan. */
export function normalizeHref(raw: string): string {
	const value = raw.trim()
	if (!value) return ''
	if (SCHEME.test(value) || value.startsWith('/') || value.startsWith('#')) return value
	if (EMAIL.test(value)) return `mailto:${value}`
	return `https://${value}`
}

/** Pasang, ganti, atau sisipkan tautan. Teks kosong tanpa seleksi memakai URL-nya sendiri. */
export function applyLink(request: LinkDialogRequest, rawHref: string, text: string): void {
	const href = normalizeHref(rawHref)
	const { editor } = request
	if (!href) {
		removeLink(editor)
		return
	}
	const label = text.trim()
	if (request.hasRange && (label === '' || label === request.text)) {
		editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
		return
	}
	editor
		.chain()
		.focus()
		.insertContent({ type: 'text', text: label || href, marks: [{ type: 'link', attrs: { href } }] })
		.unsetMark('link')
		.run()
}

export function removeLink(editor: Editor): void {
	editor.chain().focus().extendMarkRange('link').unsetLink().run()
}

/** Buka tautan di tab baru - dari gelembung tautan atau Ctrl/Cmd+klik. */
export function openHref(href: string): void {
	if (!href) return
	window.open(href, '_blank', 'noopener,noreferrer')
}
