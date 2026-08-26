'use client'

import type { ResearchSource, ToolCall } from '@writer-hub/shared'

/**
 * Alat baca yang dijalankan server, bukan browser.
 *
 * Alat editor di `./tools.ts` membaca TipTap dan selesai seketika. Riset web
 * tidak bisa: kunci API-nya rahasia, CORS melarangnya, dan pemotongan konten
 * harus dilakukan di tempat yang tidak bisa dilewati pengguna.
 */
const ENDPOINT: Record<string, string> = {
	web_search: '/api/research/search',
	fetch_url: '/api/research/extract',
}

export function isRemoteReadTool(name: string): boolean {
	return name in ENDPOINT
}

export function remoteToolLabel(call: ToolCall): string {
	if (call.name === 'web_search') {
		const query = String(call.arguments.query ?? '').trim()
		return query ? `Mencari web: ${query}` : 'Mencari web'
	}

	const count = Array.isArray(call.arguments.urls) ? call.arguments.urls.length : 0
	return count === 1 ? 'Membaca 1 halaman' : `Membaca ${count} halaman`
}

export interface RemoteToolResult {
	text: string
	sources: ResearchSource[]
}

function requestBody(call: ToolCall): Record<string, unknown> {
	const args = call.arguments
	if (call.name === 'web_search') {
		return {
			query: String(args.query ?? ''),
			topic: args.topic,
			language: args.language,
			startDate: args.start_date,
			endDate: args.end_date,
			maxResults: args.max_results,
		}
	}

	return {
		urls: Array.isArray(args.urls) ? args.urls.slice(0, 5).map(String) : [],
		query: args.query,
	}
}

/**
 * Kegagalan dikembalikan sebagai teks hasil alat, bukan lemparan galat: model
 * masih punya giliran berikutnya dan bisa memberi tahu penulis apa yang
 * terjadi, alih-alih percakapan berhenti di tengah.
 */
export async function runRemoteReadTool(
	call: ToolCall,
	signal?: AbortSignal,
): Promise<RemoteToolResult> {
	const path = ENDPOINT[call.name]
	if (!path) return { text: `Alat ${call.name} tidak dikenal.`, sources: [] }

	try {
		const response = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(requestBody(call)),
			signal,
		})

		const payload = await response.json().catch(() => null)
		if (!response.ok) {
			const detail = payload?.errors?.join(', ') || payload?.message || `HTTP ${response.status}`
			return { text: `Riset web gagal: ${detail}`, sources: [] }
		}

		const data = payload?.data as RemoteToolResult | undefined
		if (!data?.text) return { text: 'Riset web tidak mengembalikan apa pun.', sources: [] }
		return { text: data.text, sources: data.sources ?? [] }
	} catch (cause) {
		if (signal?.aborted) throw cause
		return { text: 'Riset web gagal: tidak bisa menghubungi layanan.', sources: [] }
	}
}
