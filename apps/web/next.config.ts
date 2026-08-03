import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	reactStrictMode: true,
	// Paket workspace dikirim sebagai TypeScript mentah, jadi harus ikut dikompilasi.
	transpilePackages: ['@writer-hub/shared'],
	// Dipakai target `standalone` di docker/Dockerfile.web.
	output: 'standalone',
	outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
}

export default nextConfig
