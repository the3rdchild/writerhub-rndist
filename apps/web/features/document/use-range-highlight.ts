'use client'

import type { TextRange } from '@writer-hub/shared'
import { useMemo } from 'react'
import { useDocument } from './document-context'
export function useRangeHighlight() {
	const { dispatch } = useDocument()

	return useMemo(
		() => ({
			clearHover: () => dispatch({ type: 'setHoveredRange', range: null }),
			rangeProps: (range: TextRange) => ({
				onMouseEnter: () => dispatch({ type: 'setHoveredRange', range }),
				onMouseLeave: () => dispatch({ type: 'setHoveredRange', range: null }),
				onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
				onClick: () => dispatch({ type: 'setFocusedRange', range }),
			}),
		}),
		[dispatch],
	)
}
