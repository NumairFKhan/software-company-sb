/** @type {import('next').NextConfig} */
const nextConfig = {
  headers: async () => [
    {
      // Service worker must be served with no-cache so the browser always
      // fetches the latest version and can detect updates promptly.
      source: '/sw.js',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate',
        },
        {
          key: 'Service-Worker-Allowed',
          value: '/',
        },
      ],
    },
    {
      // Web app manifest — short cache so changes deploy quickly.
      source: '/manifest.json',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate',
        },
      ],
    },
  ],
};

export default nextConfig;
