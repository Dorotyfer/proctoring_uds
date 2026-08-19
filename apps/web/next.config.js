const frameAncestor = process.env.MOODLE_ORIGIN ?? "'self'";

const nextConfig = {
  async headers() {
    return [{
      source: '/session/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${frameAncestor}` },
        { key: 'Permissions-Policy', value: 'camera=(self)' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' }
      ]
    }, {
      source: '/panel/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' }
      ]
    }];
  },
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
