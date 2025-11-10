declare module 'next-pwa' {
  import { NextConfig } from 'next';

  interface PWAConfig {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
    [key: string]: any;
  }

  type WithPWA = (config: NextConfig) => NextConfig;

  const withPWA: (pwaConfig: PWAConfig) => WithPWA;

  export default withPWA;
}
