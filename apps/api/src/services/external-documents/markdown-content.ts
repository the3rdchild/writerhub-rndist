/**
 * Konversi Markdown menjadi dokumen ProseMirror - bentuk yang disimpan di
 * kolom `content` tab dan dirender editor.
 *
 * Murni: masuk string Markdown, keluar JSON dokumen, tanpa jaringan, basis
 * data, atau DOM. Subset sintaksnya sengaja meniru `markdownToHtml` milik
 * apps/web (heading, paragraf, tebal/miring/kode/tautan, daftar, kutipan,
 * garis, blok kode, tabel, matematika $...$) supaya dokumen buatan endpoint
 * eksternal tampil sama dengan konten yang disisipkan lewat chat.
 */

interface PmMark {
	type: string
	attrs?: Record<string, unknown>
}

interface PmNode {
	type: string
	attrs?: Record<string, unknown>
	content?: PmNode[]
	marks?: PmMark[]
	text?: string
}

function textNode(text: string, marks: PmMark[]): PmNode {
	return marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text }
}

function paragraph(text: string): PmNode {
	return { type: 'paragraph', content: parseInline(text) }
}

// ── Inline ──────────────────────────────────────────────────────────────────

interface InlineMatch {
	index: number
	length: number
	nodes: PmNode[]
}

/** Pola inline yang dikenali, urut prioritas saat indeksnya sama. */
const INLINE_RULES: {
	regex: RegExp
	build: (match: RegExpMatchArray, marks: PmMark[]) => PmNode[]
	/** Panjang karakter konteks di depan penanda yang bukan bagian teks bercorak. */
	prefix?: (match: RegExpMatchArray) => number
}[] = [
	{
		// Matematika inline: $...$ atau \(...\) - menjadi node mathInline atom.
		regex: /\$([^$\n]+?)\$|\\\(([^)\n]*?)\\\)/,
		build: (match) => [{ type: 'mathInline', attrs: { latex: (match[1] ?? match[2]).trim() } }],
	},
	{
		regex: /`([^`]+)`/,
		build: (match, marks) => [textNode(match[1], [...marks, { type: 'code' }])],
	},
	{
		regex: /\*\*([^*]+)\*\*/,
		build: (match, marks) => parseInline(match[1], [...marks, { type: 'bold' }]),
	},
	{
		// Tanpa lookbehind: satu karakter sebelum '*' ikut dicocokkan supaya
		// penanda miring di tengah kata tidak salah baca, lalu dikembalikan ke
		// teks polos lewat prefix.
		regex: /([^*])?\*([^*\n]+)\*/,
		build: (match, marks) => parseInline(match[2], [...marks, { type: 'italic' }]),
		prefix: (match) => (match[1] ? 1 : 0),
	},
	{
		regex: /\[([^\]]+)\]\(([^)\s]+)\)/,
		build: (match, marks) => parseInline(match[1], [...marks, { type: 'link', attrs: { href: match[2] } }]),
	},
]

function earliestInline(text: string, marks: PmMark[]): InlineMatch | null {
	let best: InlineMatch | null = null
	for (const rule of INLINE_RULES) {
		const match = text.match(rule.regex)
		if (!match || match.index === undefined) continue
		const prefix = rule.prefix?.(match) ?? 0
		const index = match.index + prefix
		if (best && index > best.index) continue
		best = { index, length: match[0].length - prefix, nodes: rule.build(match, marks) }
	}
	return best
}

function parseInline(text: string, marks: PmMark[] = []): PmNode[] {
	const nodes: PmNode[] = []
	let rest = text
	while (rest) {
		const found = earliestInline(rest, marks)
		if (!found) {
			nodes.push(textNode(rest, marks))
			break
		}
		if (found.index > 0) nodes.push(textNode(rest.slice(0, found.index), marks))
		nodes.push(...found.nodes)
		rest = rest.slice(found.index + found.length)
	}
	return nodes
}

// ── Blok ────────────────────────────────────────────────────────────────────

const TABLE_DIVIDER = /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/

function isTableRow(line: string): boolean {
	return line.trim().startsWith('|') && line.includes('|', 1)
}

function tableCells(line: string): string[] {
	return line
		.replace(/^\s*\|/, '')
		.replace(/\|\s*$/, '')
		.split('|')
		.map((cell) => cell.trim())
}

function tableCellNode(cellType: 'tableHeader' | 'tableCell', text: string): PmNode {
	return { type: cellType, content: [paragraph(text)] }
}

export function markdownToDocument(markdown: string): Record<string, unknown> {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n')
	const blocks: PmNode[] = []
	let index = 0

	while (index < lines.length) {
		const line = lines[index]
		const trimmed = line.trim()

		if (!trimmed) {
			index += 1
			continue
		}
		const fence = trimmed.match(/^```(\S*)/)
		if (fence) {
			const body: string[] = []
			index += 1
			while (index < lines.length && !lines[index].trim().startsWith('```')) {
				body.push(lines[index])
				index += 1
			}
			index += 1 // pagar penutup
			blocks.push({
				type: 'codeBlock',
				attrs: { language: fence[1] || null },
				content: body.length > 0 ? [{ type: 'text', text: body.join('\n') }] : [],
			})
			continue
		}
		if (isTableRow(line) && index + 1 < lines.length && TABLE_DIVIDER.test(lines[index + 1])) {
			const header = tableCells(line)
			index += 2

			const rows: PmNode[] = [
				{ type: 'tableRow', content: header.map((cell) => tableCellNode('tableHeader', cell)) },
			]
			while (index < lines.length && isTableRow(lines[index])) {
				const cells = tableCells(lines[index])
				rows.push({
					type: 'tableRow',
					content: Array.from({ length: header.length }, (_, column) =>
						tableCellNode('tableCell', cells[column] ?? ''),
					),
				})
				index += 1
			}

			blocks.push({ type: 'table', content: rows })
			continue
		}
		if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			blocks.push({ type: 'horizontalRule' })
			index += 1
			continue
		}
		const blockMath = trimmed.match(/^\$\$([\s\S]+?)\$\$$/) ?? trimmed.match(/^\\\[([\s\S]+?)\\\]$/)
		if (blockMath) {
			blocks.push({ type: 'mathBlock', attrs: { latex: blockMath[1].trim() } })
			index += 1
			continue
		}
		const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
		if (heading) {
			blocks.push({
				type: 'heading',
				attrs: { level: heading[1].length },
				content: parseInline(heading[2]),
			})
			index += 1
			continue
		}
		const bullet = trimmed.match(/^[-*]\s+(.*)$/)
		const ordered = trimmed.match(/^\d+\.\s+(.*)$/)
		if (bullet || ordered) {
			const pattern = bullet ? /^[-*]\s+(.*)$/ : /^\d+\.\s+(.*)$/
			const items: PmNode[] = []
			while (index < lines.length) {
				const match = lines[index].trim().match(pattern)
				if (!match) break
				items.push({ type: 'listItem', content: [paragraph(match[1])] })
				index += 1
			}
			blocks.push({ type: bullet ? 'bulletList' : 'orderedList', content: items })
			continue
		}
		if (trimmed.startsWith('>')) {
			const quoted: string[] = []
			while (index < lines.length && lines[index].trim().startsWith('>')) {
				quoted.push(lines[index].trim().replace(/^>\s?/, ''))
				index += 1
			}
			blocks.push({ type: 'blockquote', content: [paragraph(quoted.join(' '))] })
			continue
		}

		const parts: string[] = [trimmed]
		index += 1
		while (index < lines.length) {
			const current = lines[index].trim()
			if (
				!current ||
				isTableRow(lines[index]) ||
				/^(#{1,6}\s|[-*]\s|\d+\.\s|>|```)/.test(current) ||
				/^(?:-{3,}|\*{3,}|_{3,})$/.test(current)
			) {
				break
			}
			parts.push(current)
			index += 1
		}
		blocks.push(paragraph(parts.join(' ')))
	}

	return { type: 'doc', content: blocks }
}
