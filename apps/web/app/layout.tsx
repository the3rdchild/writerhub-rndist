import type { Metadata } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import type { ReactNode } from 'react'
import { ThemeScript } from '@/components/settings/theme-script'
import { Providers } from './providers'
import './globals.css'

/** Antarmuka: sidebar, panel, toolbar. */
const ui = Inter({
	subsets: ['latin'],
	variable: '--font-ui',
	weight: ['400', '500', '600', '700'],
})

/**
 * Badan dokumen. Serif dengan tinggi-x besar dan italic sungguhan - dirancang
 * untuk teks panjang, sehingga draf terbaca seperti naskah akademik alih-alih
 * seperti isian formulir.
 */
const document = Source_Serif_4({
	subsets: ['latin'],
	variable: '--font-document',
	weight: ['400', '600', '700'],
	style: ['normal', 'italic'],
})

export const metadata: Metadata = {
	title: 'WritingHub',
	description: 'Tulis, periksa, dan sempurnakan dokumen dalam satu ruang kerja',
}

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="id"
			className={`h-full antialiased ${ui.variable} ${document.variable}`}
			suppressHydrationWarning
		>
			<head>
				<ThemeScript />
			</head>
			<body suppressHydrationWarning className="h-full">
				<Providers>{children}</Providers>
			</body>
		</html>
	)
}
