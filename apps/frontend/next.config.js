/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // ビルド時の型チェックを無効化（Vercelでのデプロイのため）
    ignoreBuildErrors: true,
  },
  eslint: {
    // ビルド時のESLintチェックを無効化（Vercelでのデプロイのため）
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig