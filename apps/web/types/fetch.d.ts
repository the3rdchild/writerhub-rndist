/* `duplex: 'half'` wajib diisi saat body fetch berupa stream (undici / Node 18+),
   tapi belum masuk lib DOM bawaan TypeScript. Dipakai di lib/server/upstream.ts. */
declare global {
	interface RequestInit {
		duplex?: 'half'
	}
}

export {}
