import { AppError } from '@/lib/error'
import {
	deleteProject,
	findProjectById,
	findProjectsByOwner,
	insertProject,
	updateProject,
} from '@/repository/project'
import BaseService from '@/services/base.service'
import type { Project } from '@/db/schemas'
import { createProjectBodySchema, updateProjectBodySchema } from './dto'
import type { ProjectSummary } from './dto'

export default class ProjectsService extends BaseService {
	async list(): Promise<Response> {
		try {
			const rows = await findProjectsByOwner(await this.identityId())
			return this.success({ data: rows.map((row) => this.toSummary(row, row.documentCount)) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async create(): Promise<Response> {
		try {
			const body = createProjectBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const project = await insertProject({ ...body.data, owner_id: await this.identityId() })
			if (!project) throw AppError.internalServerError('Gagal menyimpan proyek')

			return this.success({ data: this.toSummary(project), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async update(): Promise<Response> {
		try {
			const body = updateProjectBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const project = await updateProject(this.projectId(), await this.identityId(), body.data)
			if (!project) throw AppError.notFound('Proyek tidak ditemukan')

			return this.success({ data: this.toSummary(project) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async remove(): Promise<Response> {
		try {
			const project = await deleteProject(this.projectId(), await this.identityId())
			if (!project) throw AppError.notFound('Proyek tidak ditemukan')
			return this.success({ data: { id: project.id } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private projectId(): string {
		return this.uuidParam('id', 'ID proyek')
	}

	private toSummary(project: Project, documentCount = 0): ProjectSummary {
		return {
			id: project.id,
			name: project.name,
			color: project.color,
			documentCount,
			updatedAt: project.updated_at.getTime(),
			createdAt: project.created_at.getTime(),
		}
	}
}
