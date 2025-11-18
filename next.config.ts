
import type {NextConfig} from 'next';
import withPWA from 'next-pwa';

const pwaConfig = {
  dest: 'public',
  register: true, // Ensure the SW is registered
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  sw: 'sw.js',
};

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  serverActions: {
    allowedOrigins: ['*'],
  },
};

const withPwaConfig = withPWA(pwaConfig);
export default withPwaConfig(nextConfig);
