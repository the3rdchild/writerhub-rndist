'use client'

import { Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ChatResume } from '@/features/chat/chat-context'
import { emptySections } from '@/features/chat/stall'
import { useEditorInstance } from '@/features/editor/editor-context'

/** Jeda sebelum bab kosong dihitung ulang sesudah naskah berubah. */
const MEASURE_DELAY_MS = 400

/**
 * Tombol "Lanjutkan" di atas kotak chat: meneruskan tugas terakhir tanpa
 * mengetik "lanjut".
 *
 * Muncul untuk tugas yang dihentikan penulis atau yang kartu macetnya ia
 * tutup, dan untuk tugas menulis yang meninggalkan bab tingkat satu tanpa isi -
 * termasuk yang oleh AI sendiri dinyatakan "selesai". Tugas yang benar-benar
 * tuntas tidak menampilkan apa pun.
 */
export function ResumeChip({ resume, onResume }: { resume: ChatResume; onResume: () => void }) {
	const { editor } = useEditorInstance()
	const [empty, setEmpty] = useState<string[]>([])
	const [hiddenFor, setHiddenFor] = useState<string | null>(null)

	useEffect(() => {
		if (!editor || editor.isDestroyed) return
		const measure = () => setEmpty(emptySections(editor.state.doc).empty)
		measure()
		let timer: ReturnType<typeof setTimeout> | undefined
		const onUpdate = () => {
			clearTimeout(timer)
			timer = setTimeout(measure, MEASURE_DELAY_MS)
		}
		editor.on('update', onUpdate)
		return () => {
			clearTimeout(timer)
			editor.off('update', onUpdate)
		}
	}, [editor])

	if (hiddenFor === resume.taskId) return null
	const remaining = resume.wrote ? empty : []
	if (!resume.interrupted && remaining.length === 0) return null

	const noun = remaining.every((title) => /^bab\b/i.test(title)) ? 'bab' : 'bagian'
	const detail =
		remaining.length > 0
			? `${remaining.length} ${noun} masih kosong`
			: resume.interrupted === 'stopped'
				? 'tugas yang dihentikan'
				: 'tugas yang terjeda'

	return (
		<div className="flex items-center gap-1 text-[11px]">
			<button
				type="button"
				onClick={onResume}
				title={remaining.length > 0 ? `Masih kosong: ${remaining.join(', ')}` : undefined}
				className="flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-foreground transition-colors hover:border-accent/60"
			>
				<Play className="h-3 w-3 shrink-0 text-accent" />
				<span className="shrink-0">Lanjutkan</span>
				<span className="truncate text-subtle">· {detail}</span>
			</button>
			<button
				type="button"
				onClick={() => setHiddenFor(resume.taskId)}
				aria-label="Sembunyikan tombol lanjutkan"
				className="shrink-0 rounded-full p-1 text-faint transition-colors hover:text-foreground"
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	)
}
