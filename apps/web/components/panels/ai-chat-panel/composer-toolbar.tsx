'use client'

import { FileText, Globe, Plus, Trash2, Zap } from 'lucide-react'
import { useChat } from '@/features/chat/chat-context'
import { ModelPicker } from './model-picker'
import { ToggleIcon } from './toggle-icon'

/**
 * Baris kontrol di atas kotak ketik: pemilih model, tombol lingkup konteks,
 * dan aksi percakapan. Seluruh keadaannya berasal dari useChat(), jadi tidak
 * ada satu pun prop yang perlu diteruskan dari panel.
 */
export function ComposerToolbar() {
	const {
		messages,
		isRunning,
		includeDocument,
		setIncludeDocument,
		autoApply,
		setAutoApply,
		research,
		setResearch,
		reset,
		startNewTopic,
	} = useChat()

	return (
		<div className="flex items-center gap-1.5">
			<ModelPicker />

			<ToggleIcon
				icon={FileText}
				label="Whole document"
				hint="Send the full text of the active tab (default: outline summary only)"
				active={includeDocument}
				onClick={() => setIncludeDocument(!includeDocument)}
			/>

			{/*
			 */}
			<ToggleIcon
				icon={Zap}
				label="Auto-apply"
				hint={
					autoApply
						? 'AI edits go straight into the document - undo with Ctrl+Z'
						: 'Apply AI edits without waiting for Apply'
				}
				active={autoApply}
				onClick={() => setAutoApply(!autoApply)}
			/>

			<ToggleIcon
				icon={Globe}
				label="Riset web"
				hint={
					research
						? 'AI boleh mencari dan membaca halaman web - hasilnya tercatat di Aktivitas'
						: 'Nyalakan agar AI bisa mencari di web, bukan cuma membaca dokumen'
				}
				active={research}
				onClick={() => setResearch(!research)}
			/>

			{messages.length > 0 && (
				<>
					<button
						type="button"
						onClick={startNewTopic}
						title="Start a new topic (old action cards expire)"
						aria-label="Start a new topic"
						className="ml-auto shrink-0 rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={reset}
						title="Clear conversation"
						aria-label="Clear conversation"
						className="shrink-0 rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				</>
			)}
		</div>
	)
}
