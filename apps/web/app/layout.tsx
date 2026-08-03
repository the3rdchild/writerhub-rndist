import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { ThemeScript } from '@/components/settings/theme-script'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({
	subsets: ['latin'],
	variable: '--font-sans',
	weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
	title: 'WritingHub',
	description: 'Tulis, periksa, dan sempurnakan dokumen dalam satu ruang kerja',
}

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="id" className={`h-full antialiased ${inter.variable}`} suppressHydrationWarning>
			<head>
				<ThemeScript />
			</head>
			<body suppressHydrationWarning className="h-full">
				<Providers>{children}</Providers>
			</body>
		</html>
	)
}
