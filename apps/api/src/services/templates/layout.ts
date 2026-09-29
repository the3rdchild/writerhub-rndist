import {
	ACADEMIC_NUMBERING,
	type TabLayout,
	type TabLayoutOverride,
	type TemplateSpec,
} from '@writer-hub/shared'

/**
 * Menerjemahkan tata letak sebuah template menjadi dua baris basis data yang
 * berbeda urusan: dasar dokumen (`documents.layout`) dan penimpa tab pertama
 * (`document_tabs.layout`).
 *
 * Pembagiannya bukan selera, melainkan mengikuti model Y.Doc di editor:
 * `pageSetup` punya dasar tingkat dokumen yang diwarisi setiap tab, sedangkan
 * perabot halaman (header/footer) **hanya punya representasi per tab** -
 * tidak ada satu pun kode yang membaca perabot tingkat dokumen. Perabot yang
 * cuma disimpan sebagai dasar dokumen karena itu tersimpan rapi di basis data
 * lalu tidak pernah sampai ke editor.
 *
 * Tipografi ikut jalur `pageSetup`, bukan jalur perabot: ia punya dasar
 * tingkat dokumen yang diwarisi setiap tab, dan editor membacanya dari sana.
 */

/*
 * Karya akademik lahir sudah bernomor menurut pedoman: bagian depan romawi
 * (aturan tab), badan naskah angka mulai BAB I (pemisah bagian yang disisipkan
 * `compileTemplateContent`), dan sampul tanpa nomor lewat halaman pertama
 * yang punya footer kosong sendiri.
 */
export function templateDocumentLayout(spec: TemplateSpec): TabLayout {
	const pageSetup =
		spec.frontMatter && !spec.layout.pageSetup.pageNumbering
			? { ...spec.layout.pageSetup, pageNumbering: ACADEMIC_NUMBERING.front }
			: spec.layout.pageSetup
	return {
		pageSetup,
		...(spec.layout.typography ? { typography: spec.layout.typography } : {}),
	}
}

export function templateTabLayout(spec: TemplateSpec): TabLayoutOverride | null {
	const furniture = spec.frontMatter
		? {
				...spec.layout.furniture,
				footer: { ...spec.layout.furniture?.footer, first: { text: '', align: 'center' as const } },
			}
		: spec.layout.furniture
	return furniture ? { furniture } : null
}
