/**
 * Web Locks: satu pemegang per nama di semua halaman (tab peramban) dari asal
 * yang sama. Dipakai untuk pekerjaan yang tidak boleh dikerjakan dua halaman
 * sekaligus - setiap halaman punya salinan Y.Doc besar dan tautan cloud
 * sendiri di memori, tetapi berbagi IndexedDB, localStorage, dan server.
 */

export type LockRequest = (
	name: string,
	options: { signal?: AbortSignal },
	callback: () => Promise<void>,
) => Promise<unknown>

/** null bila peramban tidak punya Web Locks; pemanggil lalu bekerja tanpa kunci, seperti satu halaman. */
export function browserLockRequest(): LockRequest | null {
	if (typeof navigator === 'undefined' || !navigator.locks) return null
	return (name, options, callback) => navigator.locks.request(name, options, callback)
}

/** Jalankan `work` sambil memegang kunci `name`; tanpa Web Locks langsung dijalankan. */
export async function withWebLock<T>(
	name: string,
	work: () => Promise<T>,
	request: LockRequest | null = browserLockRequest(),
): Promise<T> {
	if (!request) return work()
	let result: { value: T } | null = null
	await request(name, {}, async () => {
		result = { value: await work() }
	})
	if (!result) throw new Error(`Kunci ${name} dilepas tanpa hasil`)
	return (result as { value: T }).value
}
