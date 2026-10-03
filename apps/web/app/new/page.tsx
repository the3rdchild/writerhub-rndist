import type { Metadata } from 'next'
import { TemplateGallery } from '@/components/templates/template-gallery'

export const metadata: Metadata = {
	title: 'Start a new document',
	robots: { index: false, follow: false },
}

export default function NewDocumentPage() {
	return <TemplateGallery />
}
