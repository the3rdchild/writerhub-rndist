import type { Metadata } from 'next'
import { TemplateGallery } from '@/components/templates/template-gallery'

export const metadata: Metadata = {
	title: 'Mulai dokumen baru',
	robots: { index: false, follow: false },
}

export default function NewDocumentPage() {
	return <TemplateGallery />
}
