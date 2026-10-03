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

/** Kegagalan menggambar; `status` membedakan waktu habis (504) dari gambar yang tidak lolos (422). */
export interface DiagramFailure {
	error: string
	status?: number
}

export async function drawDiagram(
	request: DiagramRequest,
	signal?: AbortSignal,
): Promise<DiagramDrawn | DiagramFailure> {
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
			return { error: detail, status: response.status }
		}

		const data = payload?.data as DiagramDrawn | undefined
		if (!data?.svg) return { error: "The sub-agent didn't return an image." }
		return data
	} catch (cause) {
		if (signal?.aborted) throw cause
		return { error: "Couldn't reach the drawing service." }
	}
}

/**
 * Hasil alat untuk gambar yang gagal: sebabnya, dan apa yang layak dicoba.
 *
 * Dulu semua kegagalan berbunyi sama, dan di uji 28 Sep model menyimpulkan
 * "API gambar sedang error" lalu menulis grafiknya sebagai kode Mermaid. Waktu
 * habis dan gambar yang tidak lolos pemeriksaan butuh langkah berbeda. (Mermaid
 * sendiri cadangan yang sah: pagar ```mermaid kini digambar, lihat `markdown.ts`.)
 */
export function diagramFailureResult(failure: DiagramFailure): string {
	const next =
		failure.status === 504
			? 'It ran out of time. Try once more with a simpler description - fewer nodes, shorter labels.'
			: failure.status === 422
				? 'Its drawing failed the checks above. Adjust the description to avoid them - for a chart, give every value and the axis range - and try once more.'
				: 'Try once more.'
	return `The drawing sub-agent failed: ${failure.error} ${next} If it fails again, keep writing and tell the writer which figure is still missing.`
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
