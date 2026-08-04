'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { PanelProvider } from '@/features/analysis/panel-context'
import { ChatProvider } from '@/features/chat/chat-context'
import { DocumentImportProvider } from '@/features/document/import-context'
import { DocumentProvider } from '@/features/document/document-context'
import { EditorInstanceProvider } from '@/features/editor/editor-context'
import { SessionProvider } from '@/features/sessions/session-context'
import { SettingsProvider } from '@/features/settings/settings-context'

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Hasil analisis terikat ke isi teks tertentu lewat kunci query,
				// jadi tidak pernah usang dengan sendirinya.
				staleTime: Number.POSITIVE_INFINITY,
				refetchOnWindowFocus: false,
				retry: false,
			},
			mutations: { retry: false },
		},
	})
}

export function Providers({ children }: { children: ReactNode }) {
	// Satu QueryClient per mount browser; dibuat di state agar StrictMode
	// tidak membuat dua instance dan membuang cache.
	const [queryClient] = useState(createQueryClient)

	return (
		<QueryClientProvider client={queryClient}>
			<SettingsProvider>
				<DocumentProvider>
					{/* Sesi memulihkan naskah lengkap dengan formatnya, jadi ia harus
					    berada di dalam jangkauan instance editor. */}
					<EditorInstanceProvider>
						<SessionProvider>
							<PanelProvider>
								<ChatProvider>
									<DocumentImportProvider>{children}</DocumentImportProvider>
								</ChatProvider>
							</PanelProvider>
						</SessionProvider>
					</EditorInstanceProvider>
				</DocumentProvider>
			</SettingsProvider>
		</QueryClientProvider>
	)
}
