import type { Node as PMNode } from '@tiptap/pm/model'
import { isPageBreakLine } from '@writer-hub/shared'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import { SECTION_BREAK_NODE } from '@/features/editor/section-break'
import { hasBody } from './stall'

/**
 * Suntingan AI yang menghormati struktur naskah: heading tetap heading, isi
 * tetap di bawahnya.
 *
 * Uji use case menemukan struktur rusak di kedua model. `replace_text` dengan
 * `find` "Kata Pengantar\n[isi contoh]" - persis bentuk yang dikembalikan
 * `read_section` - menjadikan seluruh teks pengganti isi heading-nya:
 * "Kata PengantarPuji syukur…" di DOCX, isi yang tebal dan rata tengah di PDF.
 * Pengganti tanpa judul menghapus judulnya, dan rentang yang melewati subjudul
 * menurunkan subjudul itu menjadi paragraf. Semua perencanaan di sini murni
 * (dokumen masuk, rentang dan Markdown keluar) supaya bisa diuji tanpa editor.
 */

export interface DocHeading {
	index: number
	level: number
	text: string
	/** Posisi awal node heading. */
	pos: number
	/** Posisi sesudah node heading. */
	end: number
}

/** Judul tingkat atas, urut - daftar yang sama dengan `get_outline`. */
export function docHeadings(doc: PMNode): DocHeading[] {
	const found: DocHeading[] = []
	doc.forEach((node, pos) => {
		if (node.type.name !== 'heading') return
		found.push({
			index: found.length,
			level: Number(node.attrs.level) || 1,
			text: node.textContent.trim(),
			pos,
			end: pos + node.nodeSize,
		})
	})
	return found
}

/** Sama judulnya: beda spasi, huruf besar, tebal, atau titik dua penutup tidak dihitung. */
export function sameTitle(a: string, b: string): boolean {
	// Titik dua bisa di luar maupun di dalam penanda tebal: "**Judul**:", "**Judul:**".
	const norm = (text: string) =>
		text
			.trim()
			.replace(/:\s*$/, '')
			.replace(/^(\*\*|__)(.+)\1$/, '$2')
			.replace(/:\s*$/, '')
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase()
	return norm(a) === norm(b)
}

const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const isBlank = (line: string | undefined) => line === undefined || line.trim() === ''

interface HeadingLine {
	line: number
	/** Tingkat dari `#`; null untuk baris polos yang dikenali sebagai judul. */
	level: number | null
	title: string
}

/*
 * Baris judul di Markdown: `# Judul`, atau baris polos yang berdiri sendiri
 * (diapit baris kosong) dan sama dengan salah satu judul yang sudah dikenal.
 * Model sering mengulang subjudul sebagai baris biasa atau tebal; baris polos
 * lain tidak pernah dianggap judul.
 */
function headingLines(lines: readonly string[], known: readonly string[]): HeadingLine[] {
	const found: HeadingLine[] = []
	let fenced = false
	lines.forEach((line, index) => {
		if (line.trim().startsWith('```')) {
			fenced = !fenced
			return
		}
		if (fenced) return
		const atx = ATX.exec(line)
		if (atx) {
			found.push({ line: index, level: atx[1].length, title: atx[2] })
			return
		}
		const standalone = !isBlank(line) && isBlank(lines[index - 1]) && isBlank(lines[index + 1])
		if (standalone && known.some((title) => sameTitle(title, line))) {
			found.push({ line: index, level: null, title: line.trim() })
		}
	})
	return found
}

/** Teks pengganti berisi lebih dari satu blok: paragraf, judul, daftar, tabel. */
function isBlockText(text: string): boolean {
	return /\n\s*\n/.test(text.trim()) || /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|)/m.test(text)
}

/**
 * Judul yang diulang di awal Markdown dibuang: isinya ditulis di bawah judul
 * yang sudah ada, dan judul kedua hanya menjadi duplikat.
 */
export function dropLeadingTitle(markdown: string, title: string): string {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n')
	const first = lines.findIndex((line) => !isBlank(line))
	if (first === -1) return ''
	const [heading] = headingLines(lines.slice(first), [title])
	if (heading?.line !== 0 || !sameTitle(heading.title, title)) return markdown
	return lines
		.slice(first + 1)
		.join('\n')
		.replace(/^(\s*\n)+/, '')
}

export type TextReplacePlan =
	| { ok: true; from: number; to: number; markdown: string }
	| { ok: false; message: string }

/**
 * Rentang dan teks pengganti `replace_text`, disesuaikan supaya struktur utuh.
 *
 * - Heading yang tersentuh rentang dan diulang judulnya di pengganti (sebagai
 *   `#` atau baris polos) ditulis ulang sebagai heading bertingkat aslinya.
 * - Heading di tepi rentang yang tidak diulang dipertahankan: rentang digeser
 *   keluar darinya, jadi isi tidak pernah masuk ke heading dan judul tidak
 *   pernah tertimpa isi.
 * - Heading di tengah rentang yang tidak diulang membuat aksinya ditolak:
 *   menghapusnya diam-diam merusak kerangka, menebak letaknya pun tidak bisa.
 * - Pengganti berblok menimpa blok utuh bila rentangnya mencakup seluruh teks
 *   blok tepinya, bukan dilebur ke dalam blok yang ada.
 *
 * Suntingan kecil di dalam satu paragraf tidak berubah sama sekali.
 */
export function planTextReplace(doc: PMNode, from: number, to: number, replacement: string): TextReplacePlan {
	const block = isBlockText(replacement)
	const covered: DocHeading[] = []
	doc.nodesBetween(from, to, (node, pos) => {
		if (node.type.name === 'heading') {
			covered.push({
				index: covered.length,
				level: Number(node.attrs.level) || 1,
				text: node.textContent.trim(),
				pos,
				end: pos + node.nodeSize,
			})
		}
		return !node.isTextblock
	})
	if (covered.length === 0 && !block) return { ok: true, from, to, markdown: replacement }

	const lines = replacement.replace(/\r\n/g, '\n').split('\n')
	const restated = new Set<DocHeading>()
	for (const line of headingLines(
		lines,
		covered.map((heading) => heading.text),
	)) {
		const match = covered.find((heading) => !restated.has(heading) && sameTitle(heading.text, line.title))
		if (!match) continue
		restated.add(match)
		lines[line.line] = `${'#'.repeat(match.level)} ${match.text}`
	}

	const $from = doc.resolve(from)
	const $to = doc.resolve(to)
	const startHeading =
		$from.parent.type.name === 'heading' ? covered.find((h) => h.pos === $from.before()) : undefined
	const endHeading =
		$to.parent.type.name === 'heading'
			? covered.find((h) => h.pos === $to.before() && h !== startHeading)
			: undefined

	const skipped = covered.filter(
		(heading) => heading !== startHeading && heading !== endHeading && !restated.has(heading),
	)
	if (skipped.length > 0) {
		const titles = skipped.map((heading) => `"${heading.text}"`).join(', ')
		return {
			ok: false,
			message: `Not carried out: this passage crosses the heading ${titles}, and the replacement does not repeat it. Repeat each heading on its own line in the replacement, or rewrite whole sections with write_section.`,
		}
	}

	let start = from
	let end = to
	if (startHeading) {
		if (restated.has(startHeading)) start = startHeading.pos
		// Judul yang tidak diulang tetap berdiri; pengganti berblok atau yang
		// melewati judul itu dimulai sesudahnya.
		else if (block || to > startHeading.end - 1) start = startHeading.end
	}
	if (endHeading) {
		if (!restated.has(endHeading)) end = endHeading.pos
		else if ($to.parentOffset === $to.parent.content.size) end = endHeading.end
		else {
			return {
				ok: false,
				message: `Not carried out: this passage ends in the middle of the heading "${endHeading.text}". End the passage before that heading, or include the whole heading.`,
			}
		}
	}
	const markdown = lines.join('\n')
	if (block || restated.size > 0) {
		// Blok tepi yang seluruh teksnya tercakup ditimpa utuh.
		const $start = doc.resolve(start)
		const $end = doc.resolve(end)
		if ($start.parent.isTextblock && $start.parentOffset === 0) start = $start.before()
		if ($end.parent.isTextblock && $end.parentOffset === $end.parent.content.size) end = $end.after()
	} else {
		// Pengganti sebaris yang digeser keluar dari heading tetap mendarat di
		// dalam teks blok tetangganya, bukan di celah antarblok.
		if (doc.resolve(start).nodeAfter?.isTextblock && start !== from) start += 1
		if (doc.resolve(end).nodeBefore?.isTextblock && end !== to) end -= 1
	}
	if (end < start) end = start
	return { ok: true, from: start, to: end, markdown }
}

/** Akhir isi yang tidak memakan pemenggal halaman/section penutupnya. */
function beforeBreaks(doc: PMNode, pos: number, floor: number): number {
	let end = pos
	while (end > floor) {
		const before = doc.resolve(end).nodeBefore
		if (before?.type.name !== PAGE_BREAK_NODE && before?.type.name !== SECTION_BREAK_NODE) break
		end -= before.nodeSize
	}
	return end
}

/** Isi milik satu heading: sesudah node-nya sampai heading berikutnya, tingkat apa pun. */
export function ownBody(doc: PMNode, list: readonly DocHeading[], at: number): { from: number; to: number } {
	const from = list[at].end
	const next = list[at + 1]?.pos ?? doc.content.size
	return { from, to: beforeBreaks(doc, next, from) }
}

/** Akhir satu heading beserta seluruh subbagiannya. */
function subtreeEnd(doc: PMNode, list: readonly DocHeading[], at: number): number {
	const next = list.slice(at + 1).find((heading) => heading.level <= list[at].level)
	return beforeBreaks(doc, next?.pos ?? doc.content.size, list[at].end)
}

/** Ada isi (teks, tabel, gambar) antara dua posisi tingkat atas. */
function bodyBetween(doc: PMNode, from: number, to: number): boolean {
	let found = false
	doc.nodesBetween(from, to, (node, pos) => {
		if (found || pos < from) return false
		if (hasBody(node)) found = true
		return false
	})
	return found
}

/** Hanya paragraf kosong - sisa template yang boleh dibuang tanpa bertanya. */
function onlyEmptyParagraphs(doc: PMNode, from: number, to: number): boolean {
	let empty = true
	doc.nodesBetween(from, to, (node, pos) => {
		if (pos < from) return false
		if (node.type.name !== 'paragraph' || node.content.size > 0) empty = false
		return false
	})
	return empty
}

/** Heading ke-`at` beserta seluruh subbagiannya belum berisi apa pun. */
export function sectionIsEmpty(doc: PMNode, at: number): boolean {
	const list = docHeadings(doc)
	return list[at] !== undefined && !bodyBetween(doc, list[at].end, subtreeEnd(doc, list, at))
}

/**
 * Menormalkan teks blok: spasi berlebar dipipihkan, tepi dipangkas. Dipakai
 * membandingkan isi dokumen dengan isi template asal.
 */
function normText(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}

/** Isi dokumen yang menentukan apakah ia masih kerangka, di semua kedalaman. */
interface ScaffoldParts {
	/** Jenis node yang dipakai. */
	types: Set<string>
	/** Teks tiap blok teks - termasuk di dalam daftar, kutipan, dan sel tabel. */
	texts: string[]
	/** Node atom (gambar, blok HTML, rumus, …) sebagai JSON utuh. */
	atoms: string[]
}

function scaffoldParts(root: PMNode): ScaffoldParts {
	const parts: ScaffoldParts = { types: new Set(), texts: [], atoms: [] }
	root.descendants((node) => {
		if (node.isText) return false
		parts.types.add(node.type.name)
		if (node.isTextblock) {
			parts.texts.push(normText(node.textContent))
			return false
		}
		if (node.isAtom) {
			parts.atoms.push(JSON.stringify(node.toJSON()))
			return false
		}
		return true
	})
	return parts
}

/**
 * Dokumen hanya berisi kerangka template asalnya: setiap blok teks - di
 * kedalaman mana pun, termasuk sebelum heading pertama - kosong atau sama
 * persis dengan salah satu blok teks template, tidak ada jenis node yang
 * tidak dipakai template, dan setiap node atom identik dengan milik template.
 *
 * Aturannya sengaja ketat: `insert_html_block` menghapus seluruh dokumen bila
 * ini benar. Versi pertama hanya membaca satu tingkat dan menerima tabel serta
 * blok HTML sebagai kerangka - tabel karya penulis, daftar manfaat yang sudah
 * diubah, flyer lama, dan gambar ikut terhapus (tinjauan 28 Sep). Tanpa isi
 * template, tidak ada yang digantikan.
 */
export function docIsScaffold(doc: PMNode, template?: PMNode | null): boolean {
	if (!template) return false
	const expected = scaffoldParts(template)
	if (expected.texts.length === 0) return false
	const found = scaffoldParts(doc)
	if ([...found.types].some((type) => !expected.types.has(type))) return false
	const texts = new Set(expected.texts)
	if (!found.texts.every((text) => text === '' || texts.has(text))) return false
	const atoms = new Set(expected.atoms)
	return found.atoms.every((atom) => atoms.has(atom))
}

export interface SectionEdit {
	from: number
	to: number
	markdown: string
}

export type SectionWritePlan =
	| {
			ok: true
			edits: SectionEdit[]
			filled: string[]
			added: string[]
			/** Subbab yang ada tetapi tidak disebut di Markdown. */
			untouched: string[]
			/**
			 * Yang benar-benar dihapus `replaceSubsections`, termasuk turunannya.
			 * Bisa lebih sedikit dari `untouched`: subbab yang memuat subbab yang
			 * disebut dipertahankan.
			 */
			removed: string[]
	  }
	| { ok: false; message: string }

/**
 * Rencana `write_section`: isi heading ke-`at` diganti Markdown ini.
 *
 * Markdown dipecah per judul. Bagian sebelum judul pertama menjadi isi heading
 * sasaran. Judul yang sama dengan subjudul yang sudah ada mengisi subjudul itu
 * di tempatnya - kerangka template tidak digandakan. Judul baru disisipkan
 * sesudah subjudul terakhir yang cocok. Subjudul yang tidak disebut dibiarkan
 * - kecuali `replaceSubsections` true, yang menghapusnya beserta isinya.
 *
 * `untouched` selalu berisi subbab yang ada tetapi tidak disebut, apa pun pilihan.
 *
 * Suntingannya diurutkan dari posisi terbesar, supaya menerapkannya satu per
 * satu tidak menggeser posisi suntingan berikutnya.
 */
export function planSectionWrite(
	doc: PMNode,
	at: number,
	markdown: string,
	options: { replaceSubsections?: boolean; newHeading?: string } = {},
): SectionWritePlan {
	const list = docHeadings(doc)
	const head = list[at]
	if (!head) return { ok: false, message: `No heading with index ${at}. Call get_outline first.` }

	/*
	 * `edits` harus dideklarasikan sebelum blok `newHeading` di bawah,
	 * karena blok itu menambah edit pengganti heading. Sebelumnya blok itu
	 * dipanggil sebelum deklarasi, sehingga setiap `write_section` dengan
	 * `new_heading` melempar `ReferenceError` dan typecheck web gagal (TS2448).
	 */
	const edits: SectionEdit[] = []
	// If caller requests a new heading text, schedule a replacement of the
	// heading node itself by inserting a zero-length edit at the heading
	// position. The writer must explicitly request this via `newHeading`.
	if (typeof options.newHeading === 'string' && options.newHeading.trim()) {
		const newText = options.newHeading.trim()
		// Replace the heading node with one that keeps the same level.
		// We insert an edit that replaces the heading node's from..to with
		// a markdown heading line (keeps level) so that the later apply
		// phase will write the new heading in place.
		const headingLevel = head.level
		const headingMarkdown = `${'#'.repeat(headingLevel)} ${newText}`
		edits.push({ from: head.pos, to: head.end, markdown: headingMarkdown })
	}

	let subtreeLast = at
	while (subtreeLast + 1 < list.length && list[subtreeLast + 1].level > head.level) subtreeLast += 1
	const subtree = list.slice(at + 1, subtreeLast + 1)

	const lines = dropLeadingTitle(markdown, head.text).replace(/\r\n/g, '\n').split('\n')
	const marks = headingLines(
		lines,
		subtree.map((heading) => heading.text),
	)
	const segments: { title: string | null; level: number | null; body: string }[] = []
	let cut = 0
	let current: { title: string | null; level: number | null } = { title: null, level: null }
	for (const mark of marks) {
		segments.push({ ...current, body: lines.slice(cut, mark.line).join('\n') })
		current = { title: mark.title.replace(/^(\*\*|__)(.+)\1$/, '$2').trim(), level: mark.level }
		cut = mark.line + 1
	}
	segments.push({ ...current, body: lines.slice(cut).join('\n') })

	const filled: string[] = []
	const added: string[] = []
	const used = new Set<DocHeading>()
	let anchor = at

	for (const segment of segments) {
		const body = segment.body.trim()
		const title = segment.title
		if (title === null) {
			const own = ownBody(doc, list, at)
			if (body) edits.push({ ...own, markdown: body })
			// Tanpa kata pengantar: paragraf kosong template di bawah heading
			// dibuang, bukan dibiarkan menjadi celah di atas subbab pertama.
			else if (own.to > own.from && onlyEmptyParagraphs(doc, own.from, own.to))
				edits.push({ ...own, markdown: '' })
			continue
		}
		// Urutan naskah lebih dulu; subjudul yang ditulis tidak berurutan tetap
		// mengisi subjudulnya sendiri, bukan menjadi duplikat.
		const unused = (heading: DocHeading) => !used.has(heading) && sameTitle(heading.text, title)
		const match = subtree.find((heading) => heading.index > anchor && unused(heading)) ?? subtree.find(unused)
		if (match) {
			used.add(match)
			if (body) {
				edits.push({ ...ownBody(doc, list, match.index), markdown: body })
				filled.push(match.text)
			}
			anchor = match.index
			continue
		}

		// Subbagian baru selalu di bawah heading sasaran, apa pun jumlah `#`-nya.
		const level = Math.min(6, Math.max(head.level + 1, segment.level ?? list[anchor].level))
		const text = `${'#'.repeat(level)} ${title}${body ? `\n\n${body}` : ''}`
		const pos = subtreeEnd(doc, list, anchor)
		const previous = edits.at(-1)
		// Beberapa bagian baru berurutan di titik yang sama: satu sisipan, urutannya utuh.
		if (previous && previous.from === pos && previous.to === pos) previous.markdown += `\n\n${text}`
		else edits.push({ from: pos, to: pos, markdown: text })
		added.push(title)
	}

	// Subbab yang ada tapi tidak disebut di Markdown.
	const untouchedHeadings = subtree.filter((heading) => !used.has(heading))
	const untouched = untouchedHeadings.map((heading) => heading.text)
	const removed: string[] = []

	if (options.replaceSubsections) {
		// Subbab yang dibuang diproses berurutan sesuai dokumen. Subbab yang
		// sudah tercakup rentang hapus induknya dilewati. Subbab yang rentangnya
		// memuat subbab yang disebut tidak dihapus, dan dilaporkan sebagai
		// tertinggal (tetap ada di `untouched`).
		let coveredTo = -1
		for (const heading of untouchedHeadings) {
			if (heading.pos < coveredTo) {
				removed.push(heading.text)
				continue
			}
			const removeTo = subtreeEnd(doc, list, heading.index)
			const containsMentioned = subtree.some((h) => used.has(h) && h.pos > heading.pos && h.pos < removeTo)
			if (containsMentioned) continue
			edits.push({ from: heading.pos, to: removeTo, markdown: '' })
			removed.push(heading.text)
			coveredTo = removeTo
		}
	}

	if (!edits.some((edit) => edit.markdown.trim()))
		return { ok: false, message: 'Nothing to write: the content is empty.' }
	/*
	 * Dari posisi terbesar. Dua suntingan di posisi yang sama - isi subjudul
	 * yang belum berisi, lalu subbagian baru sesudahnya - diterapkan yang
	 * direncanakan belakangan lebih dulu: sisipan kedua di titik yang sama
	 * mendarat di depan yang pertama.
	 */
	const order = new Map(edits.map((edit, index) => [edit, index]))
	edits.sort((a, b) => b.from - a.from || (order.get(b) ?? 0) - (order.get(a) ?? 0))
	return { ok: true, edits, filled, added, untouched, removed }
}

/**
 * Bab tingkat 1 yang sudah ada dan masih kosong, bila Markdown `insert_content`
 * dibuka dengan judulnya.
 *
 * Model yang menulis "# Pendahuluan …" di akhir dokumen sementara template
 * sudah punya "Pendahuluan" kosong menghasilkan tiga gejala sekaligus di uji
 * UC3: judul ganda, Pendahuluan sesudah Daftar Pustaka, dan bagian asli yang
 * tetap kosong. Isinya lebih tepat ditulis ke bagian yang sudah ada. Hanya
 * judul tingkat 1 yang unik: subjudul seperti "Kesimpulan" wajar berulang di
 * beberapa bab.
 */
export function emptyChapterFor(doc: PMNode, markdown: string): number | null {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n')
	const first = lines.findIndex((line) => !isBlank(line))
	const atx = first === -1 ? null : ATX.exec(lines[first])
	if (!atx) return null

	const matches = docHeadings(doc).filter((heading) => heading.level === 1 && sameTitle(heading.text, atx[2]))
	if (matches.length !== 1) return null
	return sectionIsEmpty(doc, matches[0].index) ? matches[0].index : null
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }

/** Nomor bab dari judul "BAB IV HASIL…" atau "Bab 4 …"; null bila bukan bab bernomor. */
export function chapterNumber(title: string): number | null {
	const match = /^\s*(?:\*\*)?bab\s+([ivxlc]+|\d{1,3})\b/i.exec(title)
	if (!match) return null
	const token = match[1].toLowerCase()
	if (/^\d+$/.test(token)) return Number(token)
	let total = 0
	for (let index = 0; index < token.length; index += 1) {
		const value = ROMAN[token[index]]
		total += value < (ROMAN[token[index + 1]] ?? 0) ? -value : value
	}
	return total > 0 ? total : null
}

export type ChapterSlot =
	/** Bab bernomor sama sudah ada. `body`: Markdown tanpa baris judulnya. */
	| { kind: 'existing'; index: number; empty: boolean; title: string; body: string }
	/** Letak menurut urutan nomor, dengan pemenggal halaman yang sudah disesuaikan. */
	| { kind: 'insert'; pos: number; markdown: string; neighbour: string; side: 'after' | 'before' }

/**
 * Tempat bab bernomor yang disisipkan tanpa `after_heading`.
 *
 * Di uji use case 27 Sep (UC2), "BAB IV Hasil dan Pembahasan" mendarat sesudah
 * Daftar Pustaka dan Lampiran: template skripsi belum punya bab itu, dan
 * sisipan tanpa `after_heading` jatuh di kursor atau di akhir dokumen. Bab
 * bernomor punya tempat yang pasti - sesudah bab bernomor sebelumnya beserta
 * seluruh subbabnya, atau sebelum bab bernomor sesudahnya.
 *
 * Bila bab-bab di dokumen dipisah pemenggal halaman, bab baru ikut dipisah:
 * tanpa itu ia menempel di halaman terakhir bab sebelumnya, atau bab
 * sesudahnya menempel padanya.
 */
export function chapterSlot(doc: PMNode, markdown: string): ChapterSlot | null {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n')
	const first = lines.findIndex((line) => !isBlank(line) && !isPageBreakLine(line.trim()))
	const atx = first === -1 ? null : ATX.exec(lines[first])
	const number = atx ? chapterNumber(atx[2]) : null
	if (!atx || number === null) return null

	const list = docHeadings(doc)
	const chapters = list
		.filter((heading) => heading.level === 1)
		.map((heading) => ({ heading, number: chapterNumber(heading.text) }))
		.filter((chapter): chapter is { heading: DocHeading; number: number } => chapter.number !== null)
	if (chapters.length === 0) return null

	const same = chapters.find((chapter) => chapter.number === number)
	if (same) {
		return {
			kind: 'existing',
			index: same.heading.index,
			empty: sectionIsEmpty(doc, same.heading.index),
			title: same.heading.text,
			body: lines
				.slice(first + 1)
				.join('\n')
				.replace(/^(\s*\n)+/, ''),
		}
	}

	const breakLine = (line: string | undefined) => line !== undefined && isPageBreakLine(line.trim())
	const lower = chapters.filter((chapter) => chapter.number < number)
	const previous = lower.reduce<(typeof lower)[number] | undefined>(
		(best, chapter) => (!best || chapter.number >= best.number ? chapter : best),
		undefined,
	)
	if (previous) {
		const pos = subtreeEnd(doc, list, previous.heading.index)
		// Pemenggal penutup bab sebelumnya tetap menutupnya; bab baru membuka halamannya sendiri.
		const breaks = doc.resolve(pos).nodeAfter?.type.name === PAGE_BREAK_NODE
		const opensPage = breakLine(lines.find((line) => !isBlank(line)))
		return {
			kind: 'insert',
			pos,
			markdown: breaks && !opensPage ? `\\pagebreak\n\n${markdown}` : markdown,
			neighbour: previous.heading.text,
			side: 'after',
		}
	}

	const next = chapters.reduce((best, chapter) => (chapter.number < best.number ? chapter : best))
	const pos = next.heading.pos
	const breaks = doc.resolve(pos).nodeBefore?.type.name === PAGE_BREAK_NODE
	const closesPage = breakLine(lines.filter((line) => !isBlank(line)).at(-1))
	return {
		kind: 'insert',
		pos,
		markdown: breaks && !closesPage ? `${markdown}\n\n\\pagebreak` : markdown,
		neighbour: next.heading.text,
		side: 'before',
	}
}
