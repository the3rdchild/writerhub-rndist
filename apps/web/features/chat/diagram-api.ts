'use client'

/**
 * Memanggil sub-agent penggambar.
 *
 * Yang membuat berkas ini ada, dan bukan sekadar satu entri lagi di
 * `remote-tools.ts`: hasilnya **tidak pernah menjadi hasil alat**. Alat baca
 * jarak jauh mengembalikan teks yang langsung masuk ke konteks model; kalau
 * gambar ikut lewat pintu yang sama, ratusan baris koordinat mendarat di
 * percakapan dan dibayar lagi di setiap giliran sesudahnya - persis biaya yang
 * seluruh rancangan sub-agent ini hindari.
 *
 * Jadi jawabannya dipecah di sini: SVG untuk penyunting, tanda terima untuk
 * model.
 */

export interface DiagramDrawn {
	svg: string
	/** Yang benar-benar digambar - satu-satunya cara model tahu ia salah paham. */
	title: string
	desc: string
	size: { width: number; height: number } | null
}

export interface DiagramRequest {
	type: string
	spec: string
	dark?: boolean
	/** Sumber lama, hanya untuk gambar ulang. */
	previous?: string
	model?: string
}

export async function drawDiagram(
	request: DiagramRequest,
	signal?: AbortSignal,
): Promise<DiagramDrawn | { error: string }> {
	try {
		const response = await fetch('/api/diagrams/draw', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(request),
			signal,
		})

		const payload = await response.json().catch(() => null)
		if (!response.ok) {
			const detail = payload?.errors?.join(', ') || payload?.message || `HTTP ${response.status}`
			return { error: detail }
		}

		const data = payload?.data as DiagramDrawn | undefined
		if (!data?.svg) return { error: 'Sub-agent tidak mengembalikan gambar.' }
		return data
	} catch (cause) {
		if (signal?.aborted) throw cause
		return { error: 'Tidak bisa menghubungi layanan penggambar.' }
	}
}

/**
 * Tanda terima untuk model - pendek dengan sengaja.
 *
 * Judul dan deskripsi ikut karena keduanya datang dari gambarnya sendiri, bukan
 * dari permintaan yang dikirim. Ukurannya ikut karena itu satu-satunya petunjuk
 * bahwa gambarnya terlalu padat atau terlalu lapang tanpa perlu melihatnya.
 */
export function diagramReceipt(drawn: DiagramDrawn, redrawn = false): string {
	const size = drawn.size ? `${drawn.size.width}x${drawn.size.height}` : 'unknown size'
	const verb = redrawn ? 'Redrew' : 'Drew'
	return [
		`${verb} "${drawn.title}" (${size}) and placed it in the document.`,
		drawn.desc && `It shows: ${drawn.desc}`,
		'The markup is in the document, not here. To change it, call redraw_diagram - never read it back.',
	]
		.filter(Boolean)
		.join(' ')
}
