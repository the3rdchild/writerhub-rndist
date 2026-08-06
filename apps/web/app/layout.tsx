import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ThemeScript } from '@/components/settings/theme-script'
import { FONT_VARIABLES } from '@/features/editor/fonts'
import { Providers } from './providers'
import './globals.css'
// Gaya KaTeX diimpor dari JS, bukan lewat @import di globals.css: pipeline
// PostCSS Turbopack tidak me-resolve paket node_modules dari entry CSS, dan
// lewat sini Next ikut menangani berkas fontnya.
import 'katex/dist/katex.min.css'

export const metadata: Metadata = {
	title: 'WritingHub',
	description: 'Tulis, periksa, dan sempurnakan dokumen dalam satu ruang kerja',
}

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="id" className={`h-full antialiased ${FONT_VARIABLES}`} suppressHydrationWarning>
			<head>
				<ThemeScript />
			</head>
			<body suppressHydrationWarning className="h-full">
				<Providers>{children}</Providers>
			</body>
		</html>
	)
}
