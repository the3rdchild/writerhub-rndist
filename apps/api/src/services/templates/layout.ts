import type { TabLayout, TabLayoutOverride, TemplateSpec } from '@writer-hub/shared'

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

export function templateDocumentLayout(spec: TemplateSpec): TabLayout {
	return {
		pageSetup: spec.layout.pageSetup,
		...(spec.layout.typography ? { typography: spec.layout.typography } : {}),
	}
}

export function templateTabLayout(spec: TemplateSpec): TabLayoutOverride | null {
	return spec.layout.furniture ? { furniture: spec.layout.furniture } : null
}
