import type { Check } from './check'
import type { CaseFacts } from './measure'

/**
 * Sembilan use case uji AI Chat, dipindahkan dari alat uji putaran 17-23 Sep
 * (`writer-hub-test`, `TEMUAN-WriterHub.md`) supaya perbaikan bisa diukur
 * terhadap rangkaian yang sama - lihat QA-1 di `docs/usulan-perbaikan.md`.
 *
 * `requirements` dan `prompt` disalin apa adanya dari putaran itu; `expect`
 * adalah bagian yang bisa diukur dari berkas hasil. Yang tidak bisa diukur dari
 * berkas (isi berimbang, sumber nyata, jumlah tab) tetap di `requirements` dan
 * dinilai manual.
 */

export interface CaseExpectation {
	/** Rentang halaman yang diminta. Tanpa ini jumlah halaman tidak dinilai. */
	pages?: [number, number]
	/** Kelonggaran halaman di kedua sisi; bawaannya 1, sesuai kriteria siap produksi. */
	pageSlack?: number
	minTables?: number
	maxTables?: number
	/** Elemen visual yang harus ada sebagai gambar (`<w:drawing>`) di DOCX. */
	minImages?: number
	/** Teks yang harus muncul di naskah, tanpa beda huruf besar: "Tabel 1", "Gambar 1.2". */
	labels?: string[]
	/** Heading yang harus ada, berurutan. Pola regex tanpa beda huruf besar. */
	sections?: string[]
	/** Heading yang harus ada, urutannya bebas. */
	present?: string[]
	/** Ada seksi DOCX dua kolom. */
	twoColumns?: boolean
	custom?: (facts: CaseFacts) => Check[]
}

export interface UseCase {
	id: string
	/** Folder hasil, sama dengan putaran uji sebelumnya. */
	folder: string
	title: string
	/** Nama template di galeri; null berarti dokumen kosong. */
	template: string | null
	/** Riset web dinyalakan saat meminta outline. */
	research: boolean
	/** Kriteria penerimaan dalam kalimat. */
	requirements: string
	prompt: string
	/** Tambahan pada pesan persetujuan outline. */
	approveExtra: string
	expect: CaseExpectation
}

const allText = (facts: CaseFacts) => `${facts.docx.text}\n${facts.pdf?.text ?? ''}`

function noEmoji(facts: CaseFacts): Check {
	const found = allText(facts).match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []
	return {
		id: 'tanpa-emoji',
		label: 'Ikon berupa SVG, bukan emoji',
		ok: found.length === 0,
		detail: found.length === 0 ? 'tidak ada emoji' : `emoji: ${[...new Set(found)].join(' ')}`,
	}
}

function singleColumn(facts: CaseFacts): Check {
	const wide = facts.docx.columnSections.filter((count) => count > 1)
	return {
		id: 'satu-kolom',
		label: 'CV satu kolom (ATS)',
		ok: wide.length === 0,
		detail: wide.length === 0 ? 'satu kolom' : `seksi ${wide.join('/')} kolom`,
	}
}

function coverLetter(facts: CaseFacts): Check {
	const ok = /dengan hormat|hormat saya/i.test(allText(facts))
	return {
		id: 'surat-lamaran',
		label: 'Surat lamaran ada di berkas',
		ok,
		detail: ok ? 'salam surat ditemukan' : 'tidak ada "Dengan hormat"/"Hormat saya"',
	}
}

const UC9_DATA = [120, 135, 128, 150, 162, 158, 175, 168, 190, 205, 198, 230]

function sameNumbers(facts: CaseFacts): Check {
	const text = allText(facts)
	const missing = UC9_DATA.filter((value) => !new RegExp(`(^|\\D)${value}(\\D|$)`).test(text))
	return {
		id: 'angka-data',
		label: 'Angka sama persis dengan data',
		ok: missing.length === 0,
		detail: missing.length === 0 ? '12 angka lengkap' : `hilang: ${missing.join(', ')}`,
	}
}

function yearTotal(facts: CaseFacts): Check {
	const ok = /(^|\D)2[.,]?019(\D|$)/.test(allText(facts))
	return {
		id: 'total-setahun',
		label: 'Total setahun (2.019) disebut',
		ok,
		detail: ok ? 'total benar' : 'total tidak disebut atau keliru',
	}
}

export const USE_CASES: readonly UseCase[] = [
	{
		id: 'uc1',
		folder: 'UC1-Jurnal',
		title: `Membuat Jurnal`,
		template: 'Artikel Jurnal Nasional',
		research: true,
		requirements: `Artikel jurnal ilmiah nasional, bahasa Indonesia baku, 8-12 halaman.

Struktur wajib:
1. Judul + nama penulis, afiliasi, email
2. Abstrak (ID) 150-250 kata, 1 paragraf + 3-5 kata kunci
3. Abstract (EN) 150-250 kata, 1 paragraf + keywords
4. Pendahuluan - DITULIS 2 KOLOM: latar belakang berdata, rumusan masalah, tujuan, kebaruan
5. Metode: jenis penelitian, populasi dan sampel, instrumen, teknik analisis
6. Hasil dan Pembahasan: temuan + kaitan ke penelitian terdahulu
7. Simpulan
8. Daftar Pustaka APA 7, minimal 8 sumber nyata

Elemen visual (bernomor + bersumber):
- Tabel 1: statistik adopsi dompet digital (data riil)
- Tabel 2: ringkasan penelitian terdahulu (minimal 4 studi)
- Tabel 3: hasil analisis (boleh ilustrasi)
- Gambar 1: chart tren (data riil)
- Gambar 2: infografis ringkasan statistik kunci

Aturan data: Angka hasil riset web wajib menyebut sumber; angka yang sifatnya ilustrasi wajib diberi label "(data ilustrasi)".`,
		prompt: `Buatkan saya artikel jurnal ilmiah berjudul "Pengaruh Penggunaan Dompet Digital terhadap Perilaku Konsumtif Mahasiswa di Indonesia". Bahasa Indonesia baku, 8-12 halaman.

Struktur wajib:
1. Judul + nama penulis, afiliasi, email
2. Abstrak (bahasa Indonesia) 150-250 kata + 3-5 kata kunci
3. Abstract (bahasa Inggris) 150-250 kata + keywords
4. Pendahuluan, ditulis dalam 2 KOLOM: latar belakang berdata, rumusan masalah, tujuan, kebaruan
5. Metode: jenis penelitian, populasi dan sampel, instrumen, teknik analisis
6. Hasil dan Pembahasan
7. Simpulan
8. Daftar Pustaka APA 7, minimal 8 sumber nyata

Wajib ada: Tabel 1 statistik adopsi dompet digital (data riil), Tabel 2 ringkasan minimal 4 penelitian terdahulu, Tabel 3 hasil analisis, Gambar 1 chart tren, dan Gambar 2 infografis statistik kunci. Semua tabel dan gambar diberi nomor, judul, dan sumber.

Pakai riset web untuk data dan referensi yang nyata. Angka yang sifatnya ilustrasi beri label "(data ilustrasi)".

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan bagian Pendahuluan benar-benar 2 kolom dan terisi seimbang, dan kelima tabel/gambar benar-benar ada di dokumen.`,
		expect: {
			pages: [8, 12],
			minTables: 3,
			minImages: 2,
			// Abstrak dan Abstract di template jurnal adalah paragraf tebal, bukan heading.
			labels: ['Abstrak', 'Abstract', 'Tabel 1', 'Tabel 2', 'Tabel 3', 'Gambar 1', 'Gambar 2'],
			sections: ['pendahuluan', 'metode', 'hasil', 'simpulan', 'daftar pustaka|referensi'],
			twoColumns: true,
		},
	},
	{
		id: 'uc2',
		folder: 'UC2-Skripsi-SI',
		title: `Membuat Skripsi Sistem Informasi`,
		template: 'Skripsi (S1)',
		research: true,
		requirements: `Skripsi S1 Sistem Informasi, versi ringkas 12-15 halaman, APA 7.

Struktur wajib:
1. Halaman judul, halaman pengesahan, pernyataan orisinalitas
2. Abstrak (ID) + Abstract (EN), masing-masing + kata kunci
3. Kata pengantar; Daftar isi, daftar tabel, daftar gambar (memakai daftar isi otomatis, bukan diketik)
4. BAB I: latar belakang, rumusan masalah (3 poin), tujuan, manfaat, batasan
5. BAB II: landasan teori (sistem informasi, inventaris, waterfall, UML, black box, UAT) + penelitian terdahulu (tabel, minimal 3 studi)
6. BAB III: metode waterfall + tahapan, tabel kebutuhan fungsional (minimal 8 baris), use case diagram, ERD
7. BAB IV: implementasi modul, tabel pengujian black box (minimal 8 skenario), chart hasil UAT, infografis alur sistem, pembahasan
8. BAB V: simpulan dan saran
9. Daftar pustaka APA 7, minimal 10 sumber nyata

Elemen visual: minimal 4 gambar bernomor (use case diagram, ERD, infografis alur, chart UAT) dan 4 tabel bernomor.

Aturan data: studi kasus fiktif; semua angka pengujian dan kuesioner diberi label "(data ilustrasi)". Angka hasil riset web wajib menyebut sumber; angka yang sifatnya ilustrasi wajib diberi label "(data ilustrasi)".`,
		prompt: `Buatkan saya skripsi S1 program studi Sistem Informasi berjudul "Rancang Bangun Sistem Informasi Inventaris Laboratorium Komputer Berbasis Web (Studi Kasus: Politeknik Contoh)". Versi ringkas 12-15 halaman, sitasi APA 7.

Struktur wajib:
1. Halaman judul, halaman pengesahan, pernyataan orisinalitas
2. Abstrak (Indonesia) dan Abstract (Inggris), masing-masing + kata kunci
3. Kata pengantar, lalu daftar isi, daftar tabel, dan daftar gambar memakai daftar isi otomatis (jangan diketik manual)
4. BAB I: latar belakang, rumusan masalah 3 poin, tujuan, manfaat, batasan
5. BAB II: landasan teori (sistem informasi, inventaris, waterfall, UML, black box testing, UAT) dan penelitian terdahulu dalam bentuk tabel minimal 3 studi
6. BAB III: metode waterfall dan tahapannya, tabel kebutuhan fungsional minimal 8 baris, use case diagram, dan ERD
7. BAB IV: implementasi modul, tabel pengujian black box minimal 8 skenario, chart hasil kuesioner UAT, infografis alur sistem, dan pembahasan
8. BAB V: simpulan dan saran
9. Daftar pustaka APA 7 minimal 10 sumber nyata

Semua tabel dan gambar diberi nomor dan judul. Studi kasusnya fiktif: semua angka pengujian dan kuesioner beri label "(data ilustrasi)". Pakai riset web untuk referensi yang nyata.

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan use case diagram, ERD, infografis alur, chart UAT, tabel kebutuhan fungsional, dan tabel black box benar-benar masuk ke dokumen.`,
		expect: {
			pages: [12, 15],
			minTables: 4,
			minImages: 4,
			labels: ['Use Case', 'ERD'],
			sections: ['^bab i\\b', '^bab ii\\b', '^bab iii\\b', '^bab iv\\b', '^bab v\\b', 'daftar pustaka'],
			present: ['^abstrak', '^abstract', 'kata pengantar', 'daftar isi'],
		},
	},
	{
		id: 'uc3',
		folder: 'UC3-Laporan-Tokoh',
		title: `Membuat Laporan Formal Tokoh: Joko Widodo`,
		template: 'Makalah Kuliah',
		research: true,
		requirements: `Laporan formal profil dan kebijakan tokoh, 8-12 halaman, bahasa Indonesia baku, berimbang.

Struktur wajib:
1. Halaman judul (judul, periode, penyusun)
2. Ringkasan eksekutif, 1 paragraf padat
3. Pendahuluan: latar belakang, tujuan penulisan, metodologi dan sumber data
4. Profil singkat: latar belakang dan jenjang karier
5. Pembahasan kebijakan utama: infrastruktur, ekonomi, sosial
6. Capaian dan kritik, disajikan berimbang (minimal 3 capaian dan 3 kritik dengan sumber)
7. Kesimpulan tanpa rekomendasi kebijakan baru
8. Daftar sumber APA 7, minimal 8 sumber nyata dari lembaga resmi atau media kredibel

Elemen visual:
- Tabel 1: indikator ekonomi 2014-2024, minimal 5 indikator
- Gambar 1: chart tren indikator utama
- Gambar 2: infografis linimasa masa jabatan

Aturan data: semua fakta dan angka berasal dari riset web dan menyebut sumbernya. Angka hasil riset web wajib menyebut sumber; angka yang sifatnya ilustrasi wajib diberi label "(data ilustrasi)".`,
		prompt: `Buatkan saya laporan formal berjudul "Profil dan Rekam Jejak Kebijakan Joko Widodo sebagai Presiden Republik Indonesia (2014-2024)". 8-12 halaman, bahasa Indonesia baku, berimbang.

Struktur wajib:
1. Halaman judul
2. Ringkasan eksekutif, satu paragraf padat
3. Pendahuluan: latar belakang, tujuan penulisan, metodologi dan sumber data
4. Profil singkat: latar belakang dan jenjang karier
5. Pembahasan kebijakan utama: infrastruktur, ekonomi, sosial
6. Capaian dan kritik, berimbang: minimal 3 capaian dan 3 kritik, masing-masing dengan sumber
7. Kesimpulan, tanpa rekomendasi kebijakan baru
8. Daftar sumber APA 7, minimal 8 sumber nyata

Wajib ada Tabel 1 indikator ekonomi 2014-2024 (minimal 5 indikator), Gambar 1 chart tren indikator utama, dan Gambar 2 infografis linimasa masa jabatan. Semua tabel dan gambar diberi nomor, judul, dan sumber.

Semua fakta dan angka wajib dari riset web dengan sumber yang disebutkan.

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan tabel indikator, chart tren, dan infografis linimasa benar-benar masuk ke dokumen, dan bagian kritik tidak lebih tipis dari bagian capaian.`,
		expect: {
			pages: [8, 12],
			minTables: 1,
			minImages: 2,
			labels: ['Tabel 1', 'Gambar 1', 'Gambar 2'],
			sections: [
				'ringkasan eksekutif',
				'pendahuluan',
				'profil',
				'kebijakan',
				'capaian|kritik',
				'simpulan',
				'daftar (sumber|pustaka)|referensi',
			],
		},
	},
	{
		id: 'uc4',
		folder: 'UC4-Kajian-MBG',
		title: `Membuat Laporan Formal Kajian Penghentian MBG`,
		template: 'Laporan Kuartalan',
		research: true,
		requirements: `Laporan kajian kebijakan, 8-12 halaman, bahasa Indonesia baku.

Struktur wajib:
1. Halaman judul
2. Ringkasan eksekutif
3. Pendahuluan: latar belakang, tujuan kajian, ruang lingkup dan metodologi
4. Gambaran program: dasar hukum dan kelembagaan, tujuan, anggaran, jangkauan
5. Analisis: temuan masalah di lapangan, argumen menghentikan, argumen melanjutkan, analisis risiko
6. Rekomendasi yang mengikuti bukti (minimal 3 butir, masing-masing dengan alasan)
7. Kesimpulan
8. Daftar sumber APA 7, minimal 8 sumber nyata

Elemen visual:
- Tabel 1: anggaran dan cakupan program
- Tabel 2: matriks risiko skenario hentikan vs lanjutkan
- Gambar 1: chart tren cakupan
- Gambar 2: infografis ringkasan temuan

Aturan data: semua fakta dan angka berasal dari riset web dan menyebut sumbernya. Angka hasil riset web wajib menyebut sumber; angka yang sifatnya ilustrasi wajib diberi label "(data ilustrasi)".`,
		prompt: `Buatkan saya laporan formal kajian kebijakan berjudul "Kajian Penghentian Program Makan Bergizi Gratis (MBG)". 8-12 halaman, bahasa Indonesia baku.

Struktur wajib:
1. Halaman judul
2. Ringkasan eksekutif
3. Pendahuluan: latar belakang, tujuan kajian, ruang lingkup dan metodologi
4. Gambaran program: dasar hukum dan kelembagaan, tujuan, anggaran, jangkauan
5. Analisis: temuan masalah di lapangan, argumen untuk menghentikan, argumen untuk melanjutkan, analisis risiko
6. Rekomendasi yang mengikuti bukti, minimal 3 butir dengan alasan
7. Kesimpulan
8. Daftar sumber APA 7, minimal 8 sumber nyata

Wajib ada Tabel 1 anggaran dan cakupan program, Tabel 2 matriks risiko skenario hentikan vs lanjutkan, Gambar 1 chart tren cakupan, dan Gambar 2 infografis ringkasan temuan. Semua tabel dan gambar diberi nomor, judul, dan sumber.

Semua fakta dan angka wajib dari riset web dengan sumber yang disebutkan.

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan kedua tabel, chart, dan infografis benar-benar masuk ke dokumen, dan rekomendasinya mengikuti bukti yang disajikan.`,
		expect: {
			pages: [8, 12],
			minTables: 2,
			minImages: 2,
			labels: ['Tabel 1', 'Tabel 2', 'Gambar 1', 'Gambar 2'],
			sections: [
				'ringkasan eksekutif',
				'pendahuluan',
				'gambaran program',
				'analisis',
				'rekomendasi',
				'simpulan',
				'daftar (sumber|pustaka)|referensi',
			],
		},
	},
	{
		id: 'uc5',
		folder: 'UC5-Flyer-A4',
		title: `Membuat Flyer A4`,
		template: 'Flyer A4',
		research: false,
		requirements: `Flyer promosi A4 potret, satu halaman penuh, dibuat sebagai blok HTML sehalaman (bukan paragraf biasa).

Isi wajib:
1. Headline besar + subheadline
2. Tiga manfaat, masing-masing dengan ikon SVG inline (bukan emoji) dan satu kalimat penjelas
3. Blok harga atau penawaran
4. Ajakan bertindak (CTA) yang menonjol
5. Informasi kontak: telepon, email, alamat, media sosial

Aturan desain:
- Satu halaman A4 potret penuh, isi tidak terpotong di tepi kertas
- Palet warna konsisten (maksimal 3 warna utama), hierarki tipografi jelas
- Semua ikon dan hiasan berupa SVG inline; dilarang memuat gambar dari URL
- Tanpa lorem ipsum: semua teks nyata dan masuk akal

Kriteria hasil: PDF tepat 1 halaman; DOCX memuat desainnya sebagai gambar.`,
		prompt: `Buatkan saya flyer A4 potret untuk kursus bahasa Inggris "English Booster" di Bandung. Satu halaman penuh, dibuat sebagai blok HTML sehalaman.

Isi wajib:
1. Headline besar dan subheadline
2. Tiga manfaat, masing-masing dengan ikon SVG inline (bukan emoji) dan satu kalimat penjelas
3. Blok harga atau penawaran (mis. diskon pendaftaran)
4. Ajakan bertindak yang menonjol
5. Kontak: telepon, email, alamat, dan media sosial

Aturan desain: satu halaman A4 potret penuh dan isinya tidak boleh terpotong di tepi kertas; palet maksimal 3 warna utama dengan hierarki tipografi yang jelas; semua ikon dan hiasan berupa SVG inline, jangan memuat gambar dari URL; semua teks nyata, tanpa lorem ipsum.

Buatkan outline dulu (konsep tata letak dan teksnya) untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Ganti emoji di bagian kontak (telepon, email, alamat) dengan ikon SVG inline, sesuai aturan desain. Pastikan flyer mengisi satu halaman A4 penuh dan tidak ada isi yang terpotong.`,
		expect: {
			pages: [1, 1],
			pageSlack: 0,
			minImages: 1,
			custom: (facts) => [noEmoji(facts)],
		},
	},
	{
		id: 'uc6',
		folder: 'UC6-Proposal-Proyek',
		title: `Membuat Proposal Proyek`,
		template: 'Proposal Proyek',
		research: false,
		requirements: `Proposal proyek bisnis, 6-10 halaman, bahasa Indonesia formal.

Struktur wajib:
1. Halaman judul (nama proyek, pengaju, tanggal)
2. Ringkasan eksekutif
3. Latar belakang dan rumusan kebutuhan
4. Ruang lingkup: yang termasuk dan yang tidak termasuk
5. Pendekatan dan metodologi kerja (tahapan)
6. Jadwal: tabel minimal 6 milestone dengan tanggal mulai dan selesai
7. Anggaran: tabel minimal 6 pos biaya dengan subtotal dan total
8. Tim dan peran
9. Risiko dan mitigasi: tabel minimal 4 risiko
10. Penutup dan persetujuan

Elemen visual: minimal 1 chart (komposisi anggaran atau linimasa proyek) dan 3 tabel bernomor.

Aturan data: angka anggaran dan jadwal boleh ilustrasi, tapi wajib konsisten (subtotal dan total harus benar).`,
		prompt: `Buatkan saya proposal proyek untuk pengembangan aplikasi absensi karyawan berbasis web bagi PT Sinar Contoh. 6-10 halaman, bahasa Indonesia formal.

Struktur wajib:
1. Halaman judul: nama proyek, pengaju, tanggal
2. Ringkasan eksekutif
3. Latar belakang dan rumusan kebutuhan
4. Ruang lingkup: yang termasuk dan yang tidak termasuk
5. Pendekatan dan metodologi kerja
6. Jadwal: tabel minimal 6 milestone dengan tanggal mulai dan selesai
7. Anggaran: tabel minimal 6 pos biaya dengan subtotal dan total
8. Tim dan peran
9. Risiko dan mitigasi: tabel minimal 4 risiko
10. Penutup dan persetujuan

Wajib ada minimal satu chart (komposisi anggaran atau linimasa proyek) dan semua tabel diberi nomor dan judul. Angka boleh ilustrasi, tapi subtotal dan totalnya harus benar-benar konsisten.

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan tabel jadwal, tabel anggaran (subtotal dan total konsisten), tabel risiko, dan chart benar-benar masuk ke dokumen.`,
		expect: {
			pages: [6, 10],
			minTables: 3,
			minImages: 1,
			sections: [
				'ringkasan eksekutif',
				'latar belakang',
				'ruang lingkup',
				'pendekatan|metodologi',
				'jadwal',
				'anggaran',
				'\\btim\\b',
				'risiko',
				'penutup',
			],
		},
	},
	{
		id: 'uc7',
		folder: 'UC7-CV-Surat-Lamaran',
		title: `Membuat CV ATS + Surat Lamaran`,
		template: 'CV / Resume (ATS)',
		research: false,
		requirements: `Dua naskah dalam satu dokumen: CV ramah ATS (tab 1) dan surat lamaran (tab 2), total 2-3 halaman.

CV (tab 1), wajib:
1. Nama, jabatan yang dilamar, kontak (telepon, email, LinkedIn, kota)
2. Ringkasan profil 2-3 kalimat
3. Pengalaman kerja: 3 posisi, tiap posisi 3-4 butir capaian dengan angka terukur
4. Pendidikan
5. Keahlian teknis dan non-teknis
6. Sertifikasi

Aturan ATS: satu kolom, tanpa tabel, tanpa ikon, tanpa header/footer berisi info penting, heading standar.

Surat lamaran (tab 2), wajib:
1. Tempat dan tanggal
2. Tujuan surat (nama perusahaan dan jabatan)
3. Salam pembuka
4. Tiga paragraf isi: alasan melamar, kecocokan pengalaman, penutup
5. Salam penutup dan nama

Kriteria hasil: dokumen punya 2 tab; ekspor DOCX bisa memuat kedua tab.`,
		prompt: `Buatkan saya dua naskah dalam satu dokumen: CV ramah ATS di tab pertama, dan surat lamaran kerja di tab kedua. Pelamar: Andi Pratama, melamar posisi Backend Engineer di PT Data Contoh. Total 2-3 halaman.

CV (tab 1) wajib memuat:
1. Nama, jabatan yang dilamar, kontak (telepon, email, LinkedIn, kota)
2. Ringkasan profil 2-3 kalimat
3. Pengalaman kerja 3 posisi, tiap posisi 3-4 butir capaian dengan angka terukur
4. Pendidikan
5. Keahlian teknis dan non-teknis
6. Sertifikasi

Aturan ATS: satu kolom, tanpa tabel, tanpa ikon, heading standar.

Surat lamaran (tab 2) wajib memuat tempat dan tanggal, tujuan surat, salam pembuka, tiga paragraf isi (alasan melamar, kecocokan pengalaman, penutup), salam penutup, dan nama.

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan surat lamaran benar-benar dibuat di tab kedua (bukan disambung di tab CV), dan CV tetap satu kolom tanpa tabel.`,
		expect: {
			pages: [2, 3],
			maxTables: 0,
			sections: ['ringkasan|profil', 'pengalaman', 'pendidikan', 'keahlian', 'sertifikasi'],
			custom: (facts) => [singleColumn(facts), coverLetter(facts)],
		},
	},
	{
		id: 'uc8',
		folder: 'UC8-Laporan-Praktikum',
		title: `Membuat Laporan Praktikum`,
		template: 'Laporan Praktikum',
		research: false,
		requirements: `Laporan praktikum, 5-8 halaman, sitasi Vancouver.

Struktur wajib:
1. Sampul: judul praktikum, nama, NIM, kelompok, tanggal
2. Tujuan praktikum (minimal 3 butir)
3. Dasar teori (dengan sitasi)
4. Alat dan bahan (daftar)
5. Prosedur kerja (langkah bernomor)
6. Data pengamatan: minimal 2 tabel bernomor
7. Analisis data: perhitungan yang ditampilkan langkahnya + 1 chart hasil
8. Pembahasan: bandingkan hasil dengan teori, sebutkan sumber galat
9. Kesimpulan (menjawab tujuan)
10. Daftar pustaka Vancouver, minimal 4 sumber

Aturan data: data pengamatan boleh ilustrasi tapi wajib konsisten dengan perhitungan dan chart-nya.`,
		prompt: `Buatkan saya laporan praktikum fisika dasar berjudul "Penentuan Percepatan Gravitasi dengan Bandul Sederhana". 5-8 halaman, sitasi Vancouver.

Struktur wajib:
1. Sampul: judul, nama, NIM, kelompok, tanggal
2. Tujuan praktikum minimal 3 butir
3. Dasar teori dengan sitasi
4. Alat dan bahan
5. Prosedur kerja, langkah bernomor
6. Data pengamatan: minimal 2 tabel bernomor (variasi panjang tali dan waktu ayunan)
7. Analisis data: tampilkan langkah perhitungannya, lengkapi dengan 1 chart hubungan panjang tali dan periode kuadrat
8. Pembahasan: bandingkan hasil dengan nilai teoretis 9,8 m/s2 dan sebutkan sumber galat
9. Kesimpulan yang menjawab tujuan
10. Daftar pustaka Vancouver minimal 4 sumber

Data pengamatan boleh ilustrasi, tapi angka di tabel, perhitungan, dan chart wajib konsisten satu sama lain.

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan kedua tabel data, langkah perhitungan, dan chart benar-benar masuk ke dokumen, dan angkanya konsisten.`,
		expect: {
			pages: [5, 8],
			minTables: 2,
			minImages: 1,
			labels: ['Tabel 1', 'Tabel 2'],
			sections: [
				'tujuan',
				'dasar teori',
				'alat dan bahan',
				'prosedur',
				'data pengamatan|hasil pengamatan',
				'analisis',
				'pembahasan',
				'simpulan',
				'daftar pustaka',
			],
		},
	},
	{
		id: 'uc9',
		folder: 'UC9-Data-Tabel-Grafik',
		title: `Menyajikan Data sebagai Tabel dan Grafik`,
		template: null,
		research: false,
		requirements: `Permintaan analisis singkat di AI Chat: data mentah diberikan penulis, hasilnya disajikan sebagai tabel dan grafik di dalam dokumen.

Wajib:
1. Tabel 1.1 berisi seluruh data yang diberikan, dengan judul tabel dan satuan yang jelas
2. Gambar 1.1 berupa grafik batang penjualan per bulan, dengan keterangan gambar di bawahnya
3. Gambar 1.2 berupa grafik garis tren, dengan keterangan gambar
4. Satu paragraf ringkasan temuan: bulan tertinggi dan terendah, tren, dan total
5. Angka di tabel, grafik, dan paragraf wajib sama persis dengan data yang diberikan

Catatan: chat belum bisa menerima gambar sebagai masukan (tidak ada jalur visi), jadi datanya diberikan sebagai teks dan dokumen hanya memuat keterangan "Gambar 1.1 ..." di bawah grafik yang dibuat AI.`,
		prompt: `Berdasarkan data penjualan berikut, sajikan dalam bentuk tabular dan grafik di dokumen ini.

Data penjualan Toko Contoh tahun 2025 (dalam juta rupiah):
Januari 120, Februari 135, Maret 128, April 150, Mei 162, Juni 158, Juli 175, Agustus 168, September 190, Oktober 205, November 198, Desember 230.

Yang saya minta:
1. Tabel 1.1 berisi seluruh data di atas, dengan judul tabel dan satuan yang jelas
2. Gambar 1.1: grafik batang penjualan per bulan, dengan keterangan gambar di bawahnya
3. Gambar 1.2: grafik garis yang menunjukkan tren sepanjang tahun, dengan keterangan gambar
4. Satu paragraf ringkasan: bulan tertinggi dan terendah, arah tren, dan total setahun

Angka di tabel, grafik, dan paragraf wajib sama persis dengan data di atas.

Buatkan outline dulu untuk saya review. Jangan menulis apa pun ke dokumen sebelum outline saya setujui.`,
		approveExtra: `Pastikan tabel dan kedua grafik benar-benar disisipkan ke dokumen, keterangan gambar ada, dan angkanya sama persis dengan data yang saya berikan.`,
		expect: {
			minTables: 1,
			minImages: 2,
			labels: ['Tabel 1.1', 'Gambar 1.1', 'Gambar 1.2'],
			custom: (facts) => [sameNumbers(facts), yearTotal(facts)],
		},
	},
]

export function caseById(id: string): UseCase {
	const found = USE_CASES.find((item) => item.id === id)
	if (!found)
		throw new Error(`Use case "${id}" tidak ada. Pilihan: ${USE_CASES.map((item) => item.id).join(', ')}`)
	return found
}
