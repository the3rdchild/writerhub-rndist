'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import type { VersionDiffRange } from '@/features/versions/diff'
import type { AnalysisDiffFeature } from './analysis-diff'

export interface ActiveAnalysisDiff {
	feature: AnalysisDiffFeature
	ranges: VersionDiffRange[]
}

interface AnalysisDiffContextValue {
	activeDiff: ActiveAnalysisDiff | null
	publish: (feature: AnalysisDiffFeature, ranges: VersionDiffRange[]) => void
	enable: (feature: AnalysisDiffFeature) => void
	disable: (feature: AnalysisDiffFeature) => void
	isEnabled: (feature: AnalysisDiffFeature) => boolean
}

const AnalysisDiffContext = createContext<AnalysisDiffContextValue | null>(null)

export function AnalysisDiffProvider({ children }: { children: ReactNode }) {
	const [activeDiff, setActiveDiff] = useState<ActiveAnalysisDiff | null>(null)

	const publish = useCallback((feature: AnalysisDiffFeature, ranges: VersionDiffRange[]) => {
		setActiveDiff((current) => (current && current.feature !== feature ? current : { feature, ranges }))
	}, [])

	const enable = useCallback((feature: AnalysisDiffFeature) => {
		setActiveDiff((current) => (current?.feature === feature ? current : { feature, ranges: [] }))
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
