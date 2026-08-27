export interface ProjectSummary {
	id: string
	name: string
	color: string | null
	documentCount: number
	updatedAt: number
	createdAt: number
}

export interface CreateProjectInput {
	name: string
	color?: string | null
}

export interface UpdateProjectInput {
	name?: string
	color?: string | null
}
