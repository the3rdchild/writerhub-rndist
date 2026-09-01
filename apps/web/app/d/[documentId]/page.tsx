import type { Metadata } from 'next'
import { DraftOpenView } from '@/components/drafts/draft-open-view'

/**
 * Tautan yang dikembalikan endpoint draf ke klien eksternal. Isinya milik satu
 * pengguna, jadi ia tidak boleh masuk indeks mesin pencari - sama seperti
 * `/share/<token>`.
 */
export const metadata: Metadata = {
	title: 'Membuka draf',
	robots: { index: false, follow: false },
}

interface DraftPageProps {
	params: Promise<{ documentId: string }>
}

export default async function DraftPage({ params }: DraftPageProps) {
	const { documentId } = await params

	return <DraftOpenView documentId={documentId} />
}
