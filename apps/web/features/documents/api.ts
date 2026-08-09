import { apiFetch } from '@/lib/api-client'
import type {
	CreateDocumentInput,
	DocumentDetail,
	DocumentSummary,
	UpdateDocumentInput,
} from './types'

/** Daftar dokumen milik user, terbaru di atas. `projectId` menyaring per
 * proyek; nilai khusus `'none'` berarti yang belum berproyek. */
export function listDocuments(projectId?: string): Promise<DocumentSummary[]> {
	const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
	return apiFetch<DocumentSummary[]>(`/documents${query}`)
}

/** Baca satu dokumen beserta naskahnya. */
export function getDocument(id: string): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>(`/documents/${encodeURIComponent(id)}`)
}

/** Simpan dokumen baru ke cloud. */
export function createDocument(input: CreateDocumentInput): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>('/documents', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Perbarui dokumen; dipakai autosave maupun rename. */
export function updateDocument(id: string, input: UpdateDocumentInput): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>(`/documents/${encodeURIComponent(id)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Hapus dokumen dari cloud. */
export function deleteDocument(id: string): Promise<void> {
	return apiFetch<void>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
