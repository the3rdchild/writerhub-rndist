import type Mermaid from 'mermaid'
let mermaidPromise: Promise<typeof Mermaid> | null = null

export function getMermaid(): Promise<typeof Mermaid> {
	if (!mermaidPromise) {
		mermaidPromise = import('mermaid').then((mod) => {
			mod.default.initialize({ startOnLoad: false, securityLevel: 'strict' })
			return mod.default
		})
	}
	return mermaidPromise
}
