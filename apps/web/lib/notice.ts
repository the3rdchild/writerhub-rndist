'use client'

/*
 * Pemberitahuan singkat untuk tindakan yang gagal tanpa dialog - mis. berkas
 * gambar yang ditolak saat diseret ke naskah. Lewat event jendela supaya
 * pemanggil di luar React (plugin ProseMirror) juga bisa memakainya;
 * ditampilkan oleh `NoticeToast` di app shell.
 */

const NOTICE_EVENT = 'writer-hub:notice'

export function showNotice(message: string): void {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new CustomEvent<string>(NOTICE_EVENT, { detail: message }))
}

export function onNotice(listener: (message: string) => void): () => void {
	const handler = (event: Event) => listener((event as CustomEvent<string>).detail)
	window.addEventListener(NOTICE_EVENT, handler)
	return () => window.removeEventListener(NOTICE_EVENT, handler)
}
