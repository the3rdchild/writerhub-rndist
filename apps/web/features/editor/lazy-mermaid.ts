import type Mermaid from 'mermaid'

/**
 * Mermaid dimuat malas (lazy) - hanya ketika diagram pertama di-render - karena
 * pustakanya besar (~1 MB+). Diadaptasi dari ferdocs (lazy-mermaid.ts); dipakai
 * node view blok kode untuk merender diagram ke SVG.
 */
let mermaidPromise: Promise<typeof Mermaid> | null = null

export function getMermaid(): Promise<typeof Mermaid> {
	if (!mermaidPromise) {
		mermaidPromise = import('mermaid').then((mod) => {
			// `securityLevel: 'strict'` mematikan HTML mentah di diagram (default
			// aman untuk konten yang mungkin tidak terpercaya).
			mod.default.initialize({ startOnLoad: false, securityLevel: 'strict' })
			return mod.default
		})
	}
	return mermaidPromise
}
