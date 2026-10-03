import { writeTabContentFromServer } from '@/collab/notify'
import { contentFromLog } from '@/collab/store'
import { AppError } from '@/lib/error'
import { findTabById } from '@/repository/document-tab'
import { findVersionById, findVersionsByTab, insertVersion } from '@/repository/document-version'
import BaseService from '@/services/base.service'
import type { VersionDetail, VersionSummary } from './dto'
import { createVersionBodySchema } from './dto'

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
			if (!version) throw AppError.notFound('Version not found')
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
			const content = body.data.content ?? (await this.currentContent(tab))
			const version = await insertVersion({
				tab_id: tab.id,
				content,
				trigger: body.data.trigger ?? 'manual',
				label: body.data.label ?? null,
				word_count: countWords(content),
				created_by: this.ownerId(),
			})
			if (!version) throw AppError.internalServerError("Couldn't save the version")

			return this.success({ data: this.toSummary(version), status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async restore(): Promise<Response> {
		try {
			const tab = await this.ownedTab()
			const version = await findVersionById(this.versionId(), tab.id)
			if (!version) throw AppError.notFound('Version not found')

			// Isi terkini dari log Yjs bila tab kolaboratif: suntingan beberapa detik
			// terakhir belum tentu sudah diturunkan ke `document_tabs.content`, dan
			// sesudah pulihkan, room-nya dibuang.
			const current = await this.currentContent(tab)
			const preRestore = await insertVersion({
				tab_id: tab.id,
				content: current,
				trigger: 'pre_restore',
				word_count: countWords(current),
				created_by: this.ownerId(),
			})
			if (!preRestore) throw AppError.internalServerError("Couldn't save the pre-restore version")

			// Tab kolaboratif ikut di-reset: klien yang terbuka diputus (4409) lalu
			// room disemai ulang dari isi yang dipulihkan ini.
			const { tab: updated } = await writeTabContentFromServer(tab.id, { content: version.content })
			if (!updated) throw AppError.internalServerError("Couldn't restore the tab")

			return this.success({
				data: { restored: this.toSummary(version), preRestoreVersionId: preRestore.id },
			})
		} catch (error) {
			return this.failFromError(error)
		}
	}
	private async currentContent(tab: { id: string; content: Record<string, unknown> }) {
		return (await contentFromLog(tab.id)) ?? tab.content
	}

	private async ownedTab() {
		const tab = await findTabById(this.tabId(), await this.identityId())
		if (!tab) throw AppError.notFound('Tab not found')
		return tab
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('Unknown user')
		return userId
	}

	private tabId(): string {
		return this.uuidParam('tabId', 'Tab ID')
	}

	private versionId(): string {
		return this.uuidParam('versionId', 'Version ID')
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
