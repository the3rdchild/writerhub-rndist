import type { DiagramDrawBody } from './dto'

/**
 * Perintah untuk sub-agent penggambar.
 *
 * Sengaja sempit. Ia tidak menerima dokumen, tidak menerima katalog alat, dan
 * tidak menerima riwayat percakapan - hanya tata bahasa diagram dan satu
 * spesifikasi. Kesempitan itulah yang dibeli: konteks kecil berarti token
 * pertama keluar lebih cepat, dan keluaran panjangnya tidak pernah singgah di
 * percakapan yang harus dibayar ulang tiap giliran.
 */

/**
 * Kontrak keluaran, ditulis sebagai perintah dan bukan sebagai harapan.
 *
 * Model yang diminta "balas dengan SVG" tetap sering menambahkan kalimat
 * pengantar dan pagar kode. Itu tidak fatal - `extractSvg` memotongnya - tapi
 * setiap kalimat tambahan adalah token yang dibayar untuk sesuatu yang langsung
 * dibuang.
 */
const OUTPUT_CONTRACT = [
	'Answer with the <svg> element and nothing else: no prose, no code fence, no explanation.',
	'The <svg> must carry a viewBox whose height does not exceed its width, and its first two children must be <title> and <desc>.',
	'Style every element with presentation attributes. A <style> element, <foreignObject>, <image>, <script>, <a>, animation elements, event handlers, and any reference pointing outside the file are all rejected.',
	'Fonts are limited to Inter, JetBrains Mono and Source Serif 4.',
	'Do not draw a title, an eyebrow or a caption inside the drawing — those belong to the document.',
].join('\n')

const DARK_NOTE =
	'Draw this one in the dark palette: paper #2d3142, ink #f5f5f5, muted #bfc0c0, accent #f08a59, and every rgba(45,49,66,X) becomes rgba(245,245,245,X) at the same opacity.'

export interface DiagramPromptSources {
	/** Badan `SKILL.md` overlay. */
	skill: string
	/** Berkas tata bahasa untuk tipe yang diminta. */
	grammar: string
}

export function buildDiagramMessages(
	body: DiagramDrawBody,
	sources: DiagramPromptSources,
): Array<{ role: string; content: string }> {
	const system = [sources.skill, sources.grammar, OUTPUT_CONTRACT, body.dark ? DARK_NOTE : '']
		.filter(Boolean)
		.join('\n\n---\n\n')

	const user = body.previous
		? [
				'Redraw the diagram below, applying this change:',
				body.spec,
				'',
				'Keep everything the change does not touch — the same layout, the same node positions, the same wording.',
				'',
				body.previous,
			].join('\n')
		: body.spec

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user },
	]
}

/**
 * Permintaan ulang sesudah jawaban pertama cacat.
 *
 * Keluhannya dikirim apa adanya, dan gambarnya ikut: model yang diminta
 * memperbaiki tiga hal pada gambar yang sudah ada memperbaikinya, sedangkan
 * model yang cuma diberi tahu bahwa jawabannya salah menggambar ulang dari nol
 * - dan yang kedua sering datang dengan cacat yang berbeda.
 */
export function repairMessage(svg: string, problems: string[]): { role: string; content: string } {
	return {
		role: 'user',
		content: [
			'That drawing cannot be used. Fix exactly these, change nothing else, and answer with the corrected <svg> alone:',
			...problems.map((problem) => `- ${problem}`),
			'',
			svg,
		].join('\n'),
	}
}
