import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	reactStrictMode: true,
	transpilePackages: ['@writer-hub/shared'],
	output: 'standalone',
	outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
}

export default nextConfig
