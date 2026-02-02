/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone for Docker deployments
  output: 'standalone',

  // Expose these env vars to the server runtime
  serverRuntimeConfig: {
    REDIS_URL: process.env.REDIS_URL,
  },
}

module.exports = nextConfig
