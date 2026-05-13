import path from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    '@napi-rs/canvas',
    '@napi-rs/canvas-darwin-arm64',
    '@napi-rs/canvas-linux-x64-gnu',
    '@napi-rs/canvas-linux-x64-musl',
  ],
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  experimental: {
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
  webpack(config, { isServer }) {
    config.resolve ??= {}
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    if (isServer) {
      config.externals ??= []
      config.externals.push({
        '@napi-rs/canvas': 'commonjs @napi-rs/canvas',
        '@napi-rs/canvas-darwin-arm64': 'commonjs @napi-rs/canvas-darwin-arm64',
        '@napi-rs/canvas-linux-x64-gnu': 'commonjs @napi-rs/canvas-linux-x64-gnu',
        '@napi-rs/canvas-linux-x64-musl': 'commonjs @napi-rs/canvas-linux-x64-musl',
      })
    }
    return config
  },
}

export default nextConfig
