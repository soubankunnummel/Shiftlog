/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Service worker must never be cached long-term, or updates won't reach installed PWAs.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
