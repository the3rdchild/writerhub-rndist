'use client'

import { useEffect, useState } from 'react'
import { useBrief } from '@/features/brief/brief-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSessions } from '@/features/sessions/session-context'
import type { OutlineProgress } from './outline-check'
import { measureOutline } from './outline-measure'

/** Jeda sesudah naskah berubah sebelum kerangka diperiksa ulang: satu pemeriksaan membaca semua tab. */
const MEASURE_DELAY_MS = 600

/** Keadaan naskah terhadap kerangka di brief, diperbarui sesudah penulis atau AI berhenti menyunting. */
export function useOutlineProgress(): OutlineProgress | null {
	const { brief } = useBrief()
	const { doc, sessions } = useSessions()
	const { editor } = useEditorInstance()
	const { setup } = usePageSetup()
	const [progress, setProgress] = useState<OutlineProgress | null>(null)
	const tabIds = sessions.map((tab) => tab.id).join('\n')

	useEffect(
		function measureAfterEdits() {
			const measure = () =>
				setProgress(measureOutline({ doc, tabIds: tabIds ? tabIds.split('\n') : [], brief, editor, setup }))
			measure()
			let timer: ReturnType<typeof setTimeout> | undefined
			const onUpdate = () => {
				clearTimeout(timer)
				timer = setTimeout(measure, MEASURE_DELAY_MS)
			}
			doc.on('update', onUpdate)
			return () => {
				clearTimeout(timer)
				doc.off('update', onUpdate)
			}
		},
		[doc, tabIds, brief, editor, setup],
	)

	return progress
}
