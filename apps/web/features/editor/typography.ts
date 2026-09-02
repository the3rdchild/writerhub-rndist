/**
 * Tipografi bawaan aplikasi: yang dipakai dokumen yang tidak membawa
 * tipografinya sendiri. Ia sejajar dengan `settings.defaultPageSetup` - sebuah
 * dasar milik pengguna, bukan milik dokumen, dan selalu kalah dari apa pun yang
 * tersimpan di Y.Doc.
 *
 * Pilihan "Ukuran huruf" di Pengaturan bermuara ke sini. Dulu ia menempelkan
 * kelas `text-[17px]` ke badan dokumen, jadi naskah tampil 12,75pt sementara
 * kotak ukuran di toolbar mengaku 11pt. Sekarang ia menyebut angka pt yang
 * sama dengan yang dibaca toolbar dan yang diekspor ke DOCX.
 */

import { DEFAULT_LINE_HEIGHT, type DocumentTypography, type FontChoice } from '@writer-hub/shared'
import type { FontSize } from '@/features/settings/settings-context'
import { DEFAULT_FONT_FAMILY } from './font-catalog'

/** Ukuran badan naskah untuk tiap pilihan "Ukuran huruf" di Pengaturan. */
export const BASE_FONT_SIZE_PT: Record<FontSize, number> = {
	small: 10,
	medium: 11,
	large: 12,
}

export function defaultTypography(fontSize: FontSize = 'medium'): DocumentTypography {
	return {
		baseFont: { family: DEFAULT_FONT_FAMILY, sizePt: BASE_FONT_SIZE_PT[fontSize] },
		lineHeight: DEFAULT_LINE_HEIGHT,
	}
}

export const DEFAULT_TYPOGRAPHY: DocumentTypography = defaultTypography()

/**
 * Membaca nilai yang tersimpan - dari Y.Doc atau dari server - menjadi bentuk
 * utuh. Yang tersimpan boleh saja lebih tua dari kode ini, jadi setiap medan
 * punya penambal.
 */
export function normalizeTypography(
	raw: unknown,
	fallback: DocumentTypography = DEFAULT_TYPOGRAPHY,
): DocumentTypography | null {
	if (!raw || typeof raw !== 'object') return null
	const value = raw as Partial<DocumentTypography>
	const font = value.baseFont as Partial<FontChoice> | undefined

	return {
		baseFont: {
			family: font?.family ?? fallback.baseFont.family,
			sizePt: font?.sizePt ?? fallback.baseFont.sizePt,
		},
		lineHeight: value.lineHeight ?? fallback.lineHeight,
		...(value.paragraph ? { paragraph: value.paragraph } : {}),
		...(value.headings ? { headings: value.headings } : {}),
	}
}
