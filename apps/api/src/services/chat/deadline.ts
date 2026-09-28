/**
 * Batas waktu satu giliran chat ke provider: putus bila alirannya diam selama
 * `idleMs`, atau bila seluruh giliran melewati `totalMs`.
 *
 * Dulu satu `AbortSignal.timeout(120 detik)` untuk seluruh panggilan,
 * termasuk pembacaan alirannya. Putaran uji 29 Sep dengan DeepSeek V4 Flash
 * 0731: model itu bernalar sekitar tujuh kali lebih panjang sebelum menulis,
 * dan setiap giliran yang menulis blok besar (HTML flyer, satu bab) diputus
 * tepat di detik ke-120 padahal potongannya masih terus mengalir. Coba ulang
 * otomatisnya kena lagi di detik yang sama, dan tugasnya berhenti tanpa
 * kemajuan.
 *
 * Setiap potongan - penalaran, teks, argumen alat, komentar keep-alive -
 * mengulang hitungan jeda, jadi yang diputus hanya koneksi yang memang diam.
 * Batas total tetap ada untuk aliran yang tidak pernah selesai. Pola yang sama
 * dengan sub-agent penggambar (`diagrams/provider-call.ts`).
 */
export interface Deadline {
	/** Tanpa satu potongan pun selama ini - termasuk menunggu header - koneksi dianggap mati. */
	idleMs: number
	/** Batas atas satu giliran, sepanjang apa pun alirannya. */
	totalMs: number
}

/**
 * `fetch` dengan `Deadline`. Galatnya `TimeoutError`, yang oleh
 * `classifyProviderError` digolongkan `timeout` - baik saat menunggu header
 * maupun saat membaca badannya.
 */
export async function fetchWithDeadline(
	url: string,
	init: RequestInit,
	{ idleMs, totalMs }: Deadline,
	fetcher: typeof fetch = fetch,
): Promise<Response> {
	const controller = new AbortController()
	const stop = (detail: string) => controller.abort(new DOMException(detail, 'TimeoutError'))
	const total = setTimeout(() => stop(`not finished within ${Math.round(totalMs / 1000)} s`), totalMs)
	let idle: ReturnType<typeof setTimeout> | undefined
	const touch = () => {
		clearTimeout(idle)
		idle = setTimeout(() => stop(`no response for ${Math.round(idleMs / 1000)} s`), idleMs)
	}
	const clear = () => {
		clearTimeout(idle)
		clearTimeout(total)
	}
	touch()

	const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal
	signal.addEventListener('abort', clear, { once: true })

	let response: Response
	try {
		response = await fetcher(url, { ...init, signal })
	} catch (error) {
		clear()
		throw error
	}
	if (!response.body) {
		clear()
		return response
	}

	/*
	 * Pembacaan yang sedang menunggu ikut dihentikan, bukan dibiarkan
	 * menggantung: tidak semua runtime menggagalkan badan respons ketika sinyal
	 * `fetch`-nya dibatalkan sesudah header tiba.
	 */
	let sink: TransformStreamDefaultController<Uint8Array> | null = null
	controller.signal.addEventListener('abort', () => sink?.error(controller.signal.reason), { once: true })
	const body = response.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			start(stream) {
				sink = stream
			},
			transform(chunk, stream) {
				touch()
				stream.enqueue(chunk)
			},
			flush: clear,
		}),
	)
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	})
}
