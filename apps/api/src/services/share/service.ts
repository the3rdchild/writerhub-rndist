import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { shares, shareSnapshots } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { findDocumentsByOwner } from '@/repository/document'
import { findTabsByDocument } from '@/repository/document-tab'
import { findProjectById } from '@/repository/project'
import BaseService from '@/services/base.service'
import { createShareBodySchema } from './dto'
import type { CreateShareResponse, SharedDocument, SharedProjectResponse, SharedTab } from './dto'

/**
 * Pembuatan dan pembacaan share link PROYEK. Seluruh dokumen + tab di
 * dalamnya dibekukan sekaligus ke `share_snapshots` saat share dibuat,
 * sehingga perubahan/penghapusan proyek user tidak memengaruhi link yang
 * sudah tersebar.
 */
export default class ShareService extends BaseService {
	/** Buat share link baru: bekukan seluruh isi proyek. */
	async create(): Promise<Response> {
		try {
			const body = createShareBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}
			const { projectId, access, role } = body.data

			const identityId = await this.identityId()
			const project = await findProjectById(projectId, identityId)
			if (!project) throw AppError.notFound('Proyek tidak ditemukan')

			const documents = await this.freezeProject(projectId)

			const [snapshotShare] = await this.db
				.insert(shares)
				.values({
					project_id: projectId,
					token: this.generateToken(),
					access,
					role,
					created_by: this.context.get('userId') ?? null,
				})
				.returning()
			if (!snapshotShare) throw AppError.internalServerError('Gagal membuat share link')

			await this.db.insert(shareSnapshots).values({
				share_id: snapshotShare.id,
				content: { projectName: project.name, documents } as Record<string, unknown>,
			})

			const result: CreateShareResponse = {
				token: snapshotShare.token,
				url: `/share/${snapshotShare.token}`,
				projectId,
				projectName: project.name,
				access: snapshotShare.access,
				role: snapshotShare.role,
				createdAt: snapshotShare.created_at.getTime(),
			}

			return this.success({ data: result, status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Baca pohon dokumen lewat token share (konten beku dari snapshot). */
	async getByToken(): Promise<Response> {
		try {
			const token = this.context.req.param('token')
			if (!token) throw AppError.badRequest('Token share tidak ada')

			const [row] = await this.db
				.select({
					access: shares.access,
					role: shares.role,
					createdAt: shares.created_at,
					content: shareSnapshots.content,
				})
				.from(shares)
				.innerJoin(shareSnapshots, eq(shares.id, shareSnapshots.share_id))
				.where(eq(shares.token, token))
				.limit(1)

			if (!row) throw AppError.notFound('Share link tidak ditemukan')

			if (row.access === 'restricted' && !this.context.get('userId')) {
				throw AppError.forbidden('Proyek ini dibatasi, silakan masuk terlebih dahulu')
			}

			const content = row.content as { projectName: string; documents: SharedDocument[] }
			const response: SharedProjectResponse = {
				projectName: content.projectName,
				documents: content.documents,
				access: row.access,
				role: row.role,
				createdAt: row.createdAt.getTime(),
			}

			return this.success({ data: response })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Bekukan seluruh dokumen + tab sebuah proyek jadi pohon statis. */
	private async freezeProject(projectId: string): Promise<SharedDocument[]> {
		const documents = await findDocumentsByOwner(await this.identityId(), projectId)
		const frozen: SharedDocument[] = []
		for (const document of documents) {
			const tabs = await findTabsByDocument(document.id)
			const frozenTabs: SharedTab[] = tabs.map((tab) => ({
				id: tab.id,
				title: tab.title,
				emoji: tab.emoji,
				language: tab.language,
				content: tab.content,
			}))
			frozen.push({ id: document.id, title: document.title, tabs: frozenTabs })
		}
		return frozen
	}

	private generateToken(): string {
		return randomBytes(16).toString('base64url')
	}
}
