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
export function listDocuments(projectId?: string): Promise<DocumentSummary[]> {
	const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
	return apiFetch<DocumentSummary[]>(`/documents${query}`)
}
export function getDocument(id: string): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>(`/documents/${encodeURIComponent(id)}`)
}
export function createDocument(input: CreateDocumentInput): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>('/documents', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}
export function updateDocument(id: string, input: UpdateDocumentInput): Promise<DocumentDetail> {
	return apiFetch<DocumentDetail>(`/documents/${encodeURIComponent(id)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}
export function deleteDocument(id: string): Promise<void> {
	return apiFetch<void>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
export function listTabs(documentId: string): Promise<TabSummary[]> {
	return apiFetch<TabSummary[]>(`/documents/${encodeURIComponent(documentId)}/tabs`)
}
export function createTabApi(documentId: string, input: CreateTabInput): Promise<TabDetail> {
	return apiFetch<TabDetail>(`/documents/${encodeURIComponent(documentId)}/tabs`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}
export function getTab(tabId: string): Promise<TabDetail> {
	return apiFetch<TabDetail>(`/tabs/${encodeURIComponent(tabId)}`)
}
export function updateTab(tabId: string, input: UpdateTabInput): Promise<TabDetail> {
	return apiFetch<TabDetail>(`/tabs/${encodeURIComponent(tabId)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}
export function deleteTab(tabId: string): Promise<void> {
	return apiFetch<void>(`/tabs/${encodeURIComponent(tabId)}`, { method: 'DELETE' })
}
export function reorderTabs(documentId: string, tabIds: string[]): Promise<TabSummary[]> {
	return apiFetch<TabSummary[]>(`/documents/${encodeURIComponent(documentId)}/tabs/reorder`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ tabIds }),
	})
}
