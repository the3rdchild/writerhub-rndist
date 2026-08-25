import { AppError } from '@/lib/error'
import { findTabById, updateTab } from '@/repository/document-tab'
import { findVersionById, findVersionsByTab, insertVersion } from '@/repository/document-version'
import BaseService from '@/services/base.service'
import { createVersionBodySchema } from './dto'
import type { VersionDetail, VersionSummary } from './dto'
export function countWords(content: Record<string, unknown>): number {
	let count = 0
	const walk = (node: Record<string, unknown>): void => {
		if (typeof node.text === 'string' && node.text.trim()) {
			count += node.text.trim().split(/\s+/).length
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child as Record<string, unknown>)
		}
	}
	walk(content)
	return count
}
export default class VersionsService extends BaseService {
	async list(): Promise<Response> {
		try {
			await this.ownedTab()
			const rows = await findVersionsByTab(this.tabId())
			const result: VersionSummary[] = rows.map((row) => ({
				id: row.id,
				trigger: row.trigger,
				label: row.label,
				wordCount: row.wordCount,
				createdAt: row.createdAt.getTime(),
				feature: row.feature,
			}))
			return this.success({ data: result })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async getById(): Promise<Response> {
		try {
			await this.ownedTab()
			const version = await findVersionById(this.versionId(), this.tabId())
			if (!version) throw AppError.notFound('Versi tidak ditemukan')
			return this.success({ data: this.toDetail(version) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async create(): Promise<Response> {
		try {
			const body = createVersionBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const tab = await this.ownedTab()
			const version = await insertVersion({
				tab_id: tab.id,
				content: tab.content,
				trigger: body.data.trigger ?? 'manual',
				label: body.data.label ?? null,
				word_count: countWords(tab.content),
				created_by: this.ownerId(),
			})
			if (!version) throw AppError.internalServerError('Gagal menyimpan versi')

			return this.success({ data: this.toSummary(version), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async restore(): Promise<Response> {
		try {
			const tab = await this.ownedTab()
			const version = await findVersionById(this.versionId(), tab.id)
			if (!version) throw AppError.notFound('Versi tidak ditemukan')

			const preRestore = await insertVersion({
				tab_id: tab.id,
				content: tab.content,
				trigger: 'pre_restore',
				word_count: countWords(tab.content),
				created_by: this.ownerId(),
			})
			if (!preRestore) throw AppError.internalServerError('Gagal menyimpan versi pre-restore')

			const updated = await updateTab(tab.id, { content: version.content })
			if (!updated) throw AppError.internalServerError('Gagal memulihkan tab')

			return this.success({
				data: { restored: this.toSummary(version), preRestoreVersionId: preRestore.id },
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}
	private async ownedTab() {
		const tab = await findTabById(this.tabId(), await this.identityId())
		if (!tab) throw AppError.notFound('Tab tidak ditemukan')
		return tab
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('User tidak dikenal')
		return userId
	}

	private tabId(): string {
		const id = this.context.req.param('tabId')
		if (!id) throw AppError.badRequest('ID tab tidak ada')
		return id
	}

	private versionId(): string {
		const id = this.context.req.param('versionId')
		if (!id) throw AppError.badRequest('ID versi tidak ada')
		return id
	}

	private toSummary(version: {
		id: string
		trigger: VersionSummary['trigger']
		label: string | null
		word_count: number
		created_at: Date
		feature?: string | null
	}): VersionSummary {
		return {
			id: version.id,
			trigger: version.trigger,
			label: version.label,
			wordCount: version.word_count,
			createdAt: version.created_at.getTime(),
			feature: version.feature ?? null,
		}
	}

	private toDetail(version: {
		id: string
		trigger: VersionSummary['trigger']
		label: string | null
		word_count: number
		created_at: Date
		content: Record<string, unknown>
		feature?: string | null
	}): VersionDetail {
		return { ...this.toSummary(version), content: version.content }
	}
}
