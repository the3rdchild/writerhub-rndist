'use client'

import { Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ChatResume } from '@/features/chat/chat-context'
import { outlineDone, outlineForWriter } from '@/features/chat/outline-check'
import { emptySections } from '@/features/chat/stall'
import { useOutlineProgress } from '@/features/chat/use-outline-progress'
import { useEditorInstance } from '@/features/editor/editor-context'

/** Jeda sebelum bab kosong dihitung ulang sesudah naskah berubah. */
const MEASURE_DELAY_MS = 400

/**
 * Tombol "Continue" di atas kotak chat: meneruskan tugas terakhir tanpa
 * mengetik "lanjut".
 *
 * Muncul untuk tugas yang dihentikan penulis atau yang kartu macetnya ia
 * tutup, dan untuk tugas menulis yang meninggalkan bab tingkat satu tanpa isi -
 * termasuk yang oleh AI sendiri dinyatakan "selesai". Tugas yang benar-benar
 * tuntas tidak menampilkan apa pun.
 */
export function ResumeChip({ resume, onResume }: { resume: ChatResume; onResume: () => void }) {
	const { editor } = useEditorInstance()
	const outline = useOutlineProgress()
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
	/* Dengan kerangka, yang dihitung kerangka itu - bab, tabel/gambar yang
	 * dijanjikan, dan panjangnya; tanpa kerangka, bab tingkat satu yang kosong. */
	const lacking = resume.wrote && outline && !outlineDone(outline) ? outlineForWriter(outline) : null
	const remaining = resume.wrote && !outline ? empty : []
	if (!resume.interrupted && !lacking && remaining.length === 0) return null

	const noun = remaining.every((title) => /^bab\b/i.test(title)) ? 'chapter' : 'section'
	const detail = lacking
		? lacking.short
		: remaining.length > 0
			? `${remaining.length} ${noun}${remaining.length === 1 ? '' : 's'} still empty`
			: resume.interrupted === 'stopped'
				? 'stopped task'
				: 'paused task'
	const tooltip = lacking
		? lacking.detail.join('\n')
		: remaining.length > 0
			? `Still empty: ${remaining.join(', ')}`
			: undefined

	return (
		<div className="flex items-center gap-1 text-[11px]">
			<button
				type="button"
				onClick={onResume}
				title={tooltip}
				className="flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-foreground transition-colors hover:border-accent/60"
			>
				<Play className="h-3 w-3 shrink-0 text-accent" />
				<span className="shrink-0">Continue</span>
				<span className="truncate text-subtle">· {detail}</span>
			</button>
			<button
				type="button"
				onClick={() => setHiddenFor(resume.taskId)}
				aria-label="Hide the continue button"
				className="shrink-0 rounded-full p-1 text-faint transition-colors hover:text-foreground"
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	)
}
