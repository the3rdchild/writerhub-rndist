import { isUuid } from '@/constants/patterns'
import type { DocumentCursor } from '@/repository/document'

/** Batas `limit` satu halaman daftar dokumen. */
export const MAX_DOCUMENT_PAGE = 200
/** Ukuran halaman bila pemanggil hanya mengirim `cursor`. */
export const DEFAULT_DOCUMENT_PAGE = 50

/**
 * Kursor daftar dokumen di kawat: base64url dari `<updatedAt ms>.<id>`.
 * Pemanggil memperlakukannya sebagai token buram dan hanya mengembalikannya
 * apa adanya.
 */
export function encodeDocumentCursor(cursor: DocumentCursor): string {
	return Buffer.from(`${cursor.updatedAt.getTime()}.${cursor.id}`).toString('base64url')
}

/** null untuk kursor yang rusak atau bukan buatan kita. */
export function decodeDocumentCursor(raw: string): DocumentCursor | null {
	const decoded = Buffer.from(raw, 'base64url').toString('utf8')
	const dot = decoded.indexOf('.')
	if (dot <= 0) return null

	const ms = Number(decoded.slice(0, dot))
	const id = decoded.slice(dot + 1)
	if (!Number.isSafeInteger(ms) || ms < 0 || !isUuid(id)) return null
	return { updatedAt: new Date(ms), id }
}
