/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jcqaesoavmxucexjeudq.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

module.exports = nextConfig;
