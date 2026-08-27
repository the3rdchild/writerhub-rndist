import type { Metadata } from 'next'
import { ShareNotFound } from '@/components/share/share-not-found'
import { SharedDocumentView } from '@/components/share/shared-document-view'
import { excerpt, jsonPlainText } from '@/features/editor/text-content'
import { getSharedDocument } from '@/lib/server/share'

/** Panjang deskripsi meta yang lazim ditampilkan utuh oleh kartu pratinjau. */
const DESCRIPTION_CHARS = 160

/** Cukup untuk mengisi deskripsi tanpa membaca seluruh naskah. */
const EXCERPT_SCAN_CHARS = 400

interface SharePageProps {
	params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
	const { token } = await params
	const payload = await getSharedDocument(token)

	// Tautan berbagi tidak boleh masuk indeks mesin pencari - siapa pun yang
	// memegang link bisa membuka isinya. noindex tidak menghalangi kartu
	// pratinjau di WhatsApp, Slack maupun X: keduanya membaca tag Open Graph,
	// bukan izin perayapan.
	const robots = { index: false, follow: false }

	if (!payload) {
		return { title: 'Dokumen tidak ditemukan', robots }
	}

	const body = jsonPlainText(payload.tabs[0]?.content, EXCERPT_SCAN_CHARS)
	const description = excerpt(body, DESCRIPTION_CHARS) || 'Dokumen yang dibagikan lewat WritingHub.'
	const title = payload.documentTitle

	return {
		title,
		description,
		robots,
		openGraph: {
			title,
			description,
			type: 'article',
			url: `/share/${token}`,
		},
		twitter: { card: 'summary', title, description },
	}
}

export default async function SharePage({ params }: SharePageProps) {
	const { token } = await params
	const payload = await getSharedDocument(token)

	if (!payload) return <ShareNotFound />

	return <SharedDocumentView payload={payload} />
}
