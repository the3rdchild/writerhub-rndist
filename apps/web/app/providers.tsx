'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { AnalysisDiffProvider } from '@/features/analysis/analysis-diff-context'
import { PanelProvider } from '@/features/analysis/panel-context'
import { ChatProvider } from '@/features/chat/chat-context'
import { CommentsProvider } from '@/features/comments/comments-context'
import { DocumentProvider } from '@/features/document/document-context'
import { DocumentImportProvider } from '@/features/document/import-context'
import { EditorInstanceProvider } from '@/features/editor/editor-context'
import { SessionProvider } from '@/features/sessions/session-context'
import { SettingsProvider } from '@/features/settings/settings-context'
import { ShareProvider } from '@/features/share/share-context'
import { SyncProvider } from '@/features/sync/sync-context'
import { VersionProvider } from '@/features/versions/version-context'

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Number.POSITIVE_INFINITY,
				refetchOnWindowFocus: false,
				retry: false,
			},
			mutations: { retry: false },
		},
	})
}

export function Providers({ children }: { children: ReactNode }) {
	const [queryClient] = useState(createQueryClient)

	return (
		<QueryClientProvider client={queryClient}>
			<SettingsProvider>
				<DocumentProvider>
					{/* Naskah tinggal di Y.Doc milik sesi dan editor terikat langsung
					    ke sana, tapi teks polos untuk pipeline analisis dibaca dari
					    instance editornya - jadi sesi tetap harus berada di dalamnya. */}
					<EditorInstanceProvider>
						<SessionProvider>
							{/* Sinkronisasi butuh Y.Doc dan daftar tab dari sesi,
							    jadi ia hidup tepat di dalamnya. */}
							<SyncProvider>
								{/* Mode riwayat butuh linkage tab → dokumen server dan
								    saveToCloud untuk flush sebelum restore. */}
								<VersionProvider>
									<PanelProvider>
										{/* Mode "Compare" panel analisis: diff accept-all virtual di
									    editor utama. Hidup di dalam PanelProvider karena ia cuma
									    jembatan antar-panel, bukan penyedia data. */}
										<AnalysisDiffProvider>
											<CommentsProvider>
												<ChatProvider>
													<DocumentImportProvider>
														<ShareProvider>{children}</ShareProvider>
													</DocumentImportProvider>
												</ChatProvider>
											</CommentsProvider>
										</AnalysisDiffProvider>
									</PanelProvider>
								</VersionProvider>
							</SyncProvider>
						</SessionProvider>
					</EditorInstanceProvider>
				</DocumentProvider>
			</SettingsProvider>
		</QueryClientProvider>
	)
}
