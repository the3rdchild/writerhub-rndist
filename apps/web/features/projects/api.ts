import { apiFetch } from '@/lib/api-client'
import type { CreateProjectInput, ProjectSummary, UpdateProjectInput } from './types'
export function listProjects(): Promise<ProjectSummary[]> {
	return apiFetch<ProjectSummary[]>('/projects')
}
export function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
	return apiFetch<ProjectSummary>('/projects', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}
export function updateProject(id: string, input: UpdateProjectInput): Promise<ProjectSummary> {
	return apiFetch<ProjectSummary>(`/projects/${encodeURIComponent(id)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}
export function deleteProject(id: string): Promise<void> {
	return apiFetch<void>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
