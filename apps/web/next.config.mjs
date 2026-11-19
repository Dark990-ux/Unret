/** @type {import('next').NextConfig} */
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  // socket.io polling uses /socket.io/?… — keep the trailing slash so the proxy matches.
  skipTrailingSlashRedirect: true,
  transpilePackages: ['@unret/shared'],
  // Same-origin API access: the browser calls /api/v1/*, Next proxies to the backend.
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API}/api/v1/:path*` },
      { source: '/socket.io/', destination: `${API}/socket.io/` },
      { source: '/socket.io/:path*', destination: `${API}/socket.io/:path*` },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      ],
    }];
  },
};
export default nextConfig;
