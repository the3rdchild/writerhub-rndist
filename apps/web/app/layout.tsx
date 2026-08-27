import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ThemeScript } from '@/components/settings/theme-script'
import { FONT_VARIABLES } from '@/features/editor/fonts'
import { Providers } from './providers'
import './globals.css'
import 'katex/dist/katex.min.css'

const SITE_NAME = 'WritingHub'
const SITE_DESCRIPTION = 'Tulis, periksa, dan sempurnakan dokumen dalam satu ruang kerja'

/**
 * Dibutuhkan agar URL relatif di Open Graph - misalnya `/share/<token>` -
 * dibentuk menjadi absolut. Nilai yang tidak sah diabaikan alih-alih
 * melemparkan galat saat modul dimuat, karena itu akan menjatuhkan seluruh
 * aplikasi hanya gara-gara satu variabel lingkungan salah ketik.
 */
function siteUrl(): URL {
	const fallback = 'http://localhost:3000'
	try {
		return new URL(process.env.SITE_URL || fallback)
	} catch {
		return new URL(fallback)
	}
}

export const metadata: Metadata = {
	metadataBase: siteUrl(),
	title: {
		default: SITE_NAME,
		// Halaman anak cukup menyebut namanya sendiri; sufiksnya ditambahkan di
		// sini supaya tidak ditulis ulang di setiap halaman.
		template: `%s · ${SITE_NAME}`,
	},
	description: SITE_DESCRIPTION,
	applicationName: SITE_NAME,
	openGraph: {
		siteName: SITE_NAME,
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
		type: 'website',
		locale: 'id_ID',
	},
	twitter: {
		card: 'summary',
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
	},
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
