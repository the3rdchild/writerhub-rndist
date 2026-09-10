'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { DocumentMetadata } from '@writer-hub/shared'
import { useState } from 'react'
import { updateDocument } from '@/features/documents/api'
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/use-documents'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { useSync } from '@/features/sync/sync-context'
import { useActiveDocumentMetadata, useActiveTemplate } from '@/features/templates/use-templates'
import { TemplateMetadataDialog } from './template-metadata-dialog'

/**
 * Jalan masuk kedua ke isian metadata: dari dalam editor, kapan pun.
 *
 * Judul skripsi berubah berkali-kali, dan metadata yang tidak bisa diperbaiki
 * akan berhenti dipercaya - lalu berhenti dipakai. Yang TIDAK ikut berubah
 * adalah naskah yang sudah tertulis; itu dinyatakan di dialognya sendiri.
 */
export function DocumentMetadataDialog() {
	const { documentMetadataOpen, setDocumentMetadataOpen } = useSettings()
	const { activeId } = useSessions()
	const { linkage } = useSync()
	const template = useActiveTemplate()
	const metadata = useActiveDocumentMetadata()
	const queryClient = useQueryClient()
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	if (!documentMetadataOpen) return null

	const fields = template?.spec.metadataFields
	const documentId = activeId ? linkage[activeId]?.documentId : undefined

	if (!fields?.length || !documentId) {
		/*
		 * Dokumen tanpa template, atau yang belum tersinkron ke server, tidak punya
		 * isian maupun tempat menyimpannya. Menutup diam-diam akan terasa seperti
		 * tombol rusak, jadi alasannya dikatakan.
		 */
		return (
			<TemplateMetadataDialog
				title="Metadata dokumen"
				fields={[]}
				values={{}}
				afterCreation
				error={
					documentId
						? 'Dokumen ini tidak lahir dari template, jadi belum ada isian metadata untuknya.'
						: 'Dokumen ini belum tersinkron ke server, jadi metadatanya belum bisa disimpan.'
				}
				onSave={() => setDocumentMetadataOpen(false)}
				onClose={() => setDocumentMetadataOpen(false)}
			/>
		)
	}

	const save = async (next: DocumentMetadata) => {
		setSaving(true)
		setError(null)
		try {
			await updateDocument(documentId, { metadata: next })
			await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
			setDocumentMetadataOpen(false)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Gagal menyimpan metadata')
		} finally {
			setSaving(false)
		}
	}

	return (
		<TemplateMetadataDialog
			title={`Metadata - ${template?.name ?? 'dokumen'}`}
			fields={fields}
			values={metadata ?? {}}
			afterCreation
			saving={saving}
			error={error}
			onSave={(next) => void save(next)}
			onClose={() => setDocumentMetadataOpen(false)}
		/>
	)
}
