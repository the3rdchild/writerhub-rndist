import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	reactStrictMode: true,
	/**
	 * Host yang boleh mengambil sumber daya dev (`/_next/*`) selain localhost.
	 *
	 * Perender berkas menjalankan peramban **di dalam** jaringan Docker dan
	 * membuka `http://web:3000`, jadi Host-nya `web` - dan Next 15+ memblokir
	 * sumber daya dev dari host yang tidak dikenalnya. Gejalanya jauh dari
	 * sebabnya: chunk editor tidak pernah selesai dimuat, React tidak pernah
	 * hidrasi, dan yang terlihat cuma `data-export-ready` yang tidak pernah
	 * terpasang sampai worker menyerah setelah dua menit.
	 *
	 * Hanya berlaku di `next dev`; build produksi tidak punya sumber daya dev
	 * untuk diblokir, jadi daftar ini tidak berarti apa-apa di sana.
	 */
	allowedDevOrigins: ['web'],
	transpilePackages: ['@writer-hub/shared'],
	output: 'standalone',
	outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
}

export default nextConfig
