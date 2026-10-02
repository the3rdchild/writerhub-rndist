/** Daftar alamat dari kolom "Send to": dipisah koma, titik koma, atau spasi; yang bukan alamat dibuang. */
export function parseEmails(raw: string): string[] {
	return raw
		.split(/[\s,;]+/)
		.map((part) => part.trim())
		.filter((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part))
}
