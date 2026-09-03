import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExportDocumentView } from '@/components/export/export-document-view'
import { getExportDocument } from '@/lib/server/export'

/**
 * Halaman yang dikunjungi perender berkas, bukan manusia.
 *
 * Izinnya datang dari tanda tangan di query, bukan dari sesi - lihat
 * `services/exports/service.ts` di API untuk alasannya. Karena itu ia tidak
 * boleh diindeks maupun dipratinjau di mana pun.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

interface ExportPageProps {
	params: Promise<{ documentId: string }>
	searchParams: Promise<{ exp?: string; sig?: string }>
}

export default async function ExportPage({ params, searchParams }: ExportPageProps) {
	const { documentId } = await params
	const { exp, sig } = await searchParams

	const payload = await getExportDocument(documentId, exp ?? '', sig ?? '')
	if (!payload) notFound()

	return <ExportDocumentView payload={payload} />
}
