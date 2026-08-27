import { FileText } from 'lucide-react'
import Link from 'next/link'

/**
 * Ditampilkan untuk token yang tidak dikenal maupun dokumen terbatas yang
 * belum diautentikasi. Keduanya sengaja tampak sama - membedakannya akan
 * memberi tahu penebak token mana yang benar-benar ada.
 */
export function ShareNotFound({ reason }: { reason?: string }) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
			<FileText className="h-12 w-12 text-faint" />
			<h1 className="mt-4 text-lg font-medium text-foreground">Dokumen tidak ditemukan</h1>
			<p className="mt-1 max-w-md text-sm text-muted">
				{reason || 'Link dokumen ini rusak atau sudah tidak tersedia.'}
			</p>
			<Link
				href="/"
				className="mt-6 rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
			>
				Kembali ke editor
			</Link>
		</div>
	)
}
