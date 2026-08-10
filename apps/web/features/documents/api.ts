import { apiFetch } from '@/lib/api-client'
import type {
	CreateDocumentInput,
	CreateTabInput,
	DocumentDetail,
	DocumentSummary,
	TabDetail,
	TabSummary,
	UpdateDocumentInput,
	UpdateTabInput,
} from './types'

/** Daftar dokumen milik user, terbaru di atas. `projectId` menyaring per
 * proyek; nilai khusus `'none'` berarti yang belum berproyek. */
export function listDocuments(projectId?: string): Promise<DocumentSummary[]> {
	const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
	return apiFetch<DocumentSummary[]>(`/documents${query}`)
}

/** Baca satu dokumen beserta daftar tabnya (tanpa konten tiap tab). */
export function getDocument(id: string): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>(`/documents/${encodeURIComponent(id)}`)
}

/** Simpan dokumen baru ke cloud; server ikut membuatkan tab pertamanya. */
export function createDocument(input: CreateDocumentInput): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>('/documents', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Perbarui dokumen induk: judul dan/atau keanggotaan proyek. */
export function updateDocument(id: string, input: UpdateDocumentInput): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>(`/documents/${encodeURIComponent(id)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Hapus dokumen dari cloud; seluruh tab (dan versi/share-nya) ikut terhapus. */
export function deleteDocument(id: string): Promise<void> {
	return apiFetch<void>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Daftar tab sebuah dokumen, urut posisi. */
export function listTabs(documentId: string): Promise<TabSummary[]> {
	return apiFetch<TabSummary[]>(`/documents/${encodeURIComponent(documentId)}/tabs`)
}

/** Buat tab baru di dalam dokumen. */
export function createTabApi(documentId: string, input: CreateTabInput): Promise<TabDetail> {
	return apiFetch<TabDetail>(`/documents/${encodeURIComponent(documentId)}/tabs`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Baca satu tab beserta naskahnya. */
export function getTab(tabId: string): Promise<TabDetail> {
	return apiFetch<TabDetail>(`/tabs/${encodeURIComponent(tabId)}`)
}

/** Perbarui tab; ini jalur autosave konten. */
export function updateTab(tabId: string, input: UpdateTabInput): Promise<TabDetail> {
	return apiFetch<TabDetail>(`/tabs/${encodeURIComponent(tabId)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Hapus satu tab. */
export function deleteTab(tabId: string): Promise<void> {
	return apiFetch<void>(`/tabs/${encodeURIComponent(tabId)}`, { method: 'DELETE' })
}

/** Urutkan ulang tab sebuah dokumen; `tabIds` harus memuat seluruh tabnya. */
export function reorderTabs(documentId: string, tabIds: string[]): Promise<TabSummary[]> {
	return apiFetch<TabSummary[]>(`/documents/${encodeURIComponent(documentId)}/tabs/reorder`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ tabIds }),
	})
}
