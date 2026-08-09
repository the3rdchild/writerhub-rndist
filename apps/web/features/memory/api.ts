import { apiFetch } from '@/lib/api-client'
import type { MemoryPreferences } from './types'

/** Baca AI Memory milik user; server mengembalikan objek kosong bila belum diisi. */
export function getMemory(): Promise<MemoryPreferences> {
	return apiFetch<MemoryPreferences>('/memory')
}

/**
 * Simpan AI Memory. PUT menimpa SELURUH preferensi (bukan merge per field),
 * jadi kirim keadaan lengkap dari form.
 */
export function putMemory(preferences: MemoryPreferences): Promise<MemoryPreferences> {
	return apiFetch<MemoryPreferences>('/memory', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(preferences),
	})
}
