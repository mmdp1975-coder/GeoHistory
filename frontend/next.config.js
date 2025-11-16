/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      // ✅ Supabase storage (già presente)
      {
        protocol: 'https',
        hostname: 'jcqaesoavmxucexjeudq.supabase.co',
        pathname: '/storage/v1/object/**',
      },

      // ✅ YouTube thumbnails — necessario per evitare il tuo errore
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**',
      },

      // (Opzionale ma consigliato) anche img.youtube.com
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;

