import type { NextConfig } from 'next';

// lucide-react et date-fns sont déjà optimisés par défaut dans Next 16+ ;
// on optimise explicitement les Radix les plus utilisés pour réduire le graphe d’imports.
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      '@radix-ui/react-tabs',
    ],
  },
  async headers() {
    return [
      {
        // Sans ça, le téléphone garde l'ancien service worker pendant des heures.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
    ];
  },
};

export default nextConfig;
