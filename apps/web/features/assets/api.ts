import { apiFetch } from '@/lib/api-client'
import type { AssetSummary, AssetUrl, UploadAssetResult } from './types'

export function listAssets(projectId: string): Promise<AssetSummary[]> {
	return apiFetch<AssetSummary[]>(`/assets?projectId=${encodeURIComponent(projectId)}`)
}

/**
 * Mengunggah satu berkas. Ukuran hakikinya diukur di sini karena di peramban ia
 * gratis - gambarnya toh sudah dimuat untuk pratinjau - sementara mengukurnya di
 * server berarti menambah pustaka pengurai gambar demi dua angka.
 */
export async function uploadAsset(
	projectId: string,
	file: File,
	size?: { width: number; height: number },
): Promise<UploadAssetResult> {
	const form = new FormData()
	form.set('projectId', projectId)
	form.set('file', file)
	if (size) {
		form.set('width', String(size.width))
		form.set('height', String(size.height))
	}
	return apiFetch<UploadAssetResult>('/assets', { method: 'POST', body: form })
}

export function deleteAsset(id: string): Promise<{ id: string }> {
	return apiFetch<{ id: string }>(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * Menerbitkan URL berumur pendek untuk sekumpulan aset.
 *
 * Aset yang tidak diizinkan cukup tidak ada di jawaban - tidak ada galat
 * per-id, supaya endpoint ini tidak bisa dipakai mengintai keberadaan aset
 * milik orang lain. Pemanggilnya harus siap menerima daftar yang lebih pendek
 * dari yang ia minta.
 */
export function mintAssetUrls(ids: readonly string[]): Promise<AssetUrl[]> {
	return apiFetch<AssetUrl[]>('/assets/urls', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ids }),
	})
}

/** Ukuran hakiki sebuah berkas gambar, dibaca lewat objek URL sementara. */
export function readImageSize(file: File): Promise<{ width: number; height: number } | undefined> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file)
		const image = new Image()
		image.onload = () => {
			URL.revokeObjectURL(url)
			resolve({ width: image.naturalWidth, height: image.naturalHeight })
		}
		// Gagal mengukur bukan gagal mengunggah: kolomnya memang boleh kosong.
		image.onerror = () => {
			URL.revokeObjectURL(url)
			resolve(undefined)
		}
		image.src = url
	})
}
