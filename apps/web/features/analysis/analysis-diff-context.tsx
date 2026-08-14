'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { VersionDiffRange } from '@/features/versions/diff'
import type { AnalysisDiffFeature } from './analysis-diff'

/**
 * Mode "Compare" panel analisis: tampilkan diff "accept-all virtual" langsung
 * di editor utama (§diff hasil dengan dokumen).
 *
 * Hanya satu panel yang boleh aktif pada satu waktu - dua sumber diff
 * bertumpuk akan saling membingungkan, bukan saling melengkapi. Membuka Compare
 * di satu panel otomatis menutup Compare di panel lain.
 */
export interface ActiveAnalysisDiff {
	/** Fitur pemilik diff ini; menentukan sumber suntingan yang disintesis. */
	feature: AnalysisDiffFeature
	/** Rentang dalam koordinat teks polos dokumen, siap dipetakan ke posisi
	 *  ProseMirror oleh `AnalysisDiffHighlight`. */
	ranges: VersionDiffRange[]
}

interface AnalysisDiffContextValue {
	/** Diff yang sedang aktif, atau null bila mode Compare mati di semua panel. */
	activeDiff: ActiveAnalysisDiff | null
	/**
	 * Pasang/perbarui rentang diff untuk sebuah fitur. Mengabaikan pemanggilan
	 * dari fitur yang sedang tidak aktif, supaya panel non-aktif tidak diam-diam
	 * menimpa rentang milik panel yang sedang ditampilkan.
	 */
	publish: (feature: AnalysisDiffFeature, ranges: VersionDiffRange[]) => void
	/** Aktifkan mode Compare untuk fitur ini (dan matikan untuk yang lain). */
	enable: (feature: AnalysisDiffFeature) => void
	/** Matikan mode Compare untuk fitur ini; bila ia yang aktif, diff hilang. */
	disable: (feature: AnalysisDiffFeature) => void
	/** Benar bila fitur ini sedang menjadi sumber diff aktif. */
	isEnabled: (feature: AnalysisDiffFeature) => boolean
}

const AnalysisDiffContext = createContext<AnalysisDiffContextValue | null>(null)

export function AnalysisDiffProvider({ children }: { children: ReactNode }) {
	const [activeDiff, setActiveDiff] = useState<ActiveAnalysisDiff | null>(null)

	const publish = useCallback(
		(feature: AnalysisDiffFeature, ranges: VersionDiffRange[]) => {
			setActiveDiff((current) =>
				current && current.feature !== feature ? current : { feature, ranges },
			)
		},
		[],
	)

	const enable = useCallback((feature: AnalysisDiffFeature) => {
		setActiveDiff((current) =>
			// Sudah aktif untuk fitur ini: jangan buat objek baru supaya tidak
			// memicu re-render editor tanpa sebab.
			current?.feature === feature ? current : { feature, ranges: [] },
		)
	}, [])

	const disable = useCallback((feature: AnalysisDiffFeature) => {
		setActiveDiff((current) => (current?.feature === feature ? null : current))
	}, [])

	const value = useMemo<AnalysisDiffContextValue>(
		() => ({
			activeDiff,
			publish,
			enable,
			disable,
			isEnabled: (feature) => activeDiff?.feature === feature,
		}),
		[activeDiff, publish, enable, disable],
	)

	return <AnalysisDiffContext.Provider value={value}>{children}</AnalysisDiffContext.Provider>
}

export function useAnalysisDiffContext(): AnalysisDiffContextValue {
	const context = useContext(AnalysisDiffContext)
	if (!context) throw new Error('useAnalysisDiffContext harus dipakai di dalam <AnalysisDiffProvider>')
	return context
}
