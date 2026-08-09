import { apiFetch } from '@/lib/api-client'
import type { CreateProjectInput, ProjectSummary, UpdateProjectInput } from './types'

/** Daftar proyek milik user, yang terakhir diubah di atas. */
export function listProjects(): Promise<ProjectSummary[]> {
	return apiFetch<ProjectSummary[]>('/projects')
}

/** Buat proyek baru. */
export function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
	return apiFetch<ProjectSummary>('/projects', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Perbarui proyek (rename / ganti warna). */
export function updateProject(id: string, input: UpdateProjectInput): Promise<ProjectSummary> {
	return apiFetch<ProjectSummary>(`/projects/${encodeURIComponent(id)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Hapus proyek; dokumen di dalamnya selamat dan kembali ke "Tanpa proyek". */
export function deleteProject(id: string): Promise<void> {
	return apiFetch<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
