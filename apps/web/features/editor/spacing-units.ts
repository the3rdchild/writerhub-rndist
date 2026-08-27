/**
 * Konversi titik (pt) ↔ piksel (px). Atribut blok tersimpan dalam px,
 * sedangkan dialog spasi menampilkan pt seperti Google Docs
 * (1 pt = 4/3 px pada 96 dpi).
 */
export function ptToPx(pt: number): number {
	return Math.round((pt * 4) / 3)
}

export function pxToPt(px: number): number {
	return px * 0.75
}
