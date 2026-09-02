/**
 * Perender statis kerangka ProseMirror menjadi HTML untuk pratinjau kartu
 * galeri. Sengaja ditulis tangan alih-alih memakai renderer tiptap: pratinjau
 * berjalan tanpa DOM/editor, dan hanya perlu menangkap jenis node yang benar-
 * benar dihasilkan kompilasi template (`apps/api/.../templates/compile.ts`).
 *
 * Semua teks lolos `escapeHtml` - isi template memang milik sendiri, tapi
 * fungsi ini juga akan merender template buatan pengguna.
 */

interface PreviewNode {
	type?: string
	text?: string
	attrs?: Record<string, unknown>
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
	content?: PreviewNode[]
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderMark(text: string, mark: { type: string; attrs?: Record<string, unknown> }): string {
	switch (mark.type) {
		case 'bold':
			return `<strong>${text}</strong>`
		case 'italic':
			return `<em>${text}</em>`
		case 'underline':
			return `<u>${text}</u>`
		case 'strike':
			return `<s>${text}</s>`
		case 'code':
			return `<code>${text}</code>`
		default:
			return text
	}
}

function renderNode(node: PreviewNode): string {
	switch (node.type) {
		case 'text': {
			const text = escapeHtml(node.text ?? '')
			return (node.marks ?? []).reduce(renderMark, text)
		}
		case 'heading': {
			const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))
			return `<h${level}>${renderChildren(node)}</h${level}>`
		}
		case 'paragraph':
			return `<p>${renderChildren(node)}</p>`
		case 'bulletList':
			return `<ul>${renderChildren(node)}</ul>`
		case 'orderedList':
			return `<ol>${renderChildren(node)}</ol>`
		case 'listItem':
			return `<li>${renderChildren(node)}</li>`
		case 'blockquote':
			return `<blockquote>${renderChildren(node)}</blockquote>`
		case 'codeBlock':
			return `<pre><code>${escapeHtml(
				(node.content ?? []).map((child) => child.text ?? '').join(''),
			)}</code></pre>`
		case 'table':
			return `<table>${renderChildren(node)}</table>`
		case 'tableRow':
			return `<tr>${renderChildren(node)}</tr>`
		case 'tableHeader':
			return `<th>${renderChildren(node)}</th>`
		case 'tableCell':
			return `<td>${renderChildren(node)}</td>`
		case 'horizontalRule':
			return '<hr>'
		// Pembatas section bukan konten; di pratinjau ia cukup tampak sebagai jarak.
		case 'sectionBreak':
			return '<hr class="section-break">'
		default:
			return renderChildren(node)
	}
}

function renderChildren(node: PreviewNode): string {
	return (node.content ?? []).map(renderNode).join('')
}

/** Konten dokumen (`type: 'doc'`) menjadi satu untai HTML pratinjau. */
export function contentToPreviewHtml(content: Record<string, unknown>): string {
	return renderChildren(content as PreviewNode)
}
