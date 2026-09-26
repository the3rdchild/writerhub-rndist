/**
 * Judul bagian karya ilmiah yang ditulis model sebagai baris biasa.
 *
 * Format rujukan (dan hampir semua pedoman skripsi) menjadikan KATA
 * PENGANTAR, ABSTRAK, DAFTAR ISI, DAFTAR PUSTAKA, dan LAMPIRAN judul tingkat 1 -
 * rata tengah, membuka halaman baru, masuk daftar isi - sama seperti judul
 * BAB. Model sering menulisnya sebagai paragraf polos, dan naskahnya berakhir
 * dengan "KATA PENGANTAR" rata kiri di tengah halaman BAB sebelumnya.
 *
 * Yang dinaikkan hanya baris yang berdiri sendiri (diapit baris kosong) dan
 * pendek: kalimat yang kebetulan diawali "Lampiran" tidak ikut.
 */

const TITLE =
	/^(kata pengantar|prakata|abstrak|abstract|intisari|daftar (isi|tabel|gambar|lampiran|singkatan|istilah|simbol|pustaka|referensi)|referensi|lampiran(\s+([a-z]|\d+)\b.*)?|halaman persembahan|persembahan|motto|pernyataan orisinalitas|(halaman|lembar) pernyataan( orisinalitas)?|bab\s+[ivxlc]+(\s.+)?)$/i

const CHAPTER_NUMBER = /^bab\s+[ivxlc]+$/i
const MAX_TITLE = 90

/** Penanda tebal di sekeliling seluruh baris: "**KATA PENGANTAR**". */
function bare(line: string): string {
	return line
		.trim()
		.replace(/^(\*\*|__)(.+)\1$/, '$2')
		.trim()
}

const isBlank = (line: string | undefined) => line === undefined || line.trim() === ''

export function promoteSectionTitles(markdown: string): string {
	const lines = markdown.split('\n')
	const out: string[] = []
	let fenced = false

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]
		if (line.trim().startsWith('```')) fenced = !fenced
		if (fenced || line.trim().startsWith('#') || !isBlank(lines[index - 1])) {
			out.push(line)
			continue
		}

		const text = bare(line)
		/* "BAB I" lalu "PENDAHULUAN" di baris berikutnya - bentuk dua baris
		 * pedoman kampus - menjadi satu judul "BAB I PENDAHULUAN". */
		const next = lines[index + 1]
		if (CHAPTER_NUMBER.test(text) && next !== undefined && !isBlank(next) && isBlank(lines[index + 2])) {
			const title = bare(next)
			if (title.length <= MAX_TITLE && title === title.toUpperCase()) {
				out.push(`# ${text} ${title}`)
				index += 1
				continue
			}
		}

		// Judul tidak diakhiri tanda baca kalimat: "Bab I menjelaskan latar belakang." bukan judul.
		if (text.length <= MAX_TITLE && isBlank(next) && !/[.!?:;,]$/.test(text) && TITLE.test(text)) {
			out.push(`# ${text}`)
			continue
		}
		out.push(line)
	}

	return out.join('\n')
}
