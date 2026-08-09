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

/**
 * CRUD proyek milik user. Semua operasi diskop ke `userId` dari context
 * (diisi `authMiddleware`; dev lokal memakai fallback 'local-dev').
 */
export default class ProjectsService extends BaseService {
	/** Daftar proyek milik user, yang terakhir diubah di atas. */
	async list(): Promise<Response> {
		try {
			const rows = await findProjectsByOwner(this.ownerId())
			return this.success({ data: rows.map((row) => this.toSummary(row)) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Buat proyek baru dari sidebar Library. */
	async create(): Promise<Response> {
		try {
			const body = createProjectBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const project = await insertProject({ ...body.data, owner_id: this.ownerId() })
			if (!project) throw AppError.internalServerError('Gagal menyimpan proyek')

			return this.success({ data: this.toSummary(project), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Ubah nama/warna proyek; hanya field yang dikirim yang ditimpa. */
	async update(): Promise<Response> {
		try {
			const body = updateProjectBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const project = await updateProject(this.projectId(), this.ownerId(), body.data)
			if (!project) throw AppError.notFound('Proyek tidak ditemukan')

			return this.success({ data: this.toSummary(project) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Hapus proyek. Dokumen di dalamnya tidak ikut terhapus — FK
	 * `documents.project_id` memakai ON DELETE SET NULL.
	 */
	async remove(): Promise<Response> {
		try {
			const project = await deleteProject(this.projectId(), this.ownerId())
			if (!project) throw AppError.notFound('Proyek tidak ditemukan')
			return this.success({ data: { id: project.id } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('User tidak dikenal')
		return userId
	}

	private projectId(): string {
		const id = this.context.req.param('id')
		if (!id) throw AppError.badRequest('ID proyek tidak ada')
		return id
	}

	private toSummary(project: Project): ProjectSummary {
		return {
			id: project.id,
			name: project.name,
			color: project.color,
			updatedAt: project.updated_at.getTime(),
			createdAt: project.created_at.getTime(),
		}
	}
}
