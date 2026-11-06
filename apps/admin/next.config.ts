import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security-headers.ts';

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NODE_ENV !== 'production') }];
  },
};

export default config;
