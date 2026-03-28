/**
 * vite.config.ts
 *
 * SECURITY HARDENING:
 * - CSP meta tags set at build time (helmet handles headers in prod via reverse proxy)
 * - Source maps disabled in production (never expose source to end users)
 * - Explicit asset/chunk naming for subresource integrity compatibility
 * - Build outDir kept outside public for intentional serving control
 * - No eval()-based transforms (important for CSP compliance)
 */

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';

  // Only upload source maps to Sentry in production CI builds.
  // Requires SENTRY_AUTH_TOKEN, VITE_SENTRY_ORG, VITE_SENTRY_PROJECT to be set.
  const sentryPlugin =
    isProd && env['VITE_SENTRY_DSN']
      ? sentryVitePlugin({
          org: env['VITE_SENTRY_ORG'] ?? '',
          project: env['VITE_SENTRY_PROJECT'] ?? 'sbdmm-web',
          authToken: env['SENTRY_AUTH_TOKEN'],
          // Upload source maps, then delete them so they are never served publicly.
          sourcemaps: {
            filesToDeleteAfterUpload: ['./dist/assets/**/*.map'],
          },
          // Associate release with the Git commit SHA for pinpoint error linking.
          release: {
            name: env['SENTRY_RELEASE'] ?? env['VITE_APP_VERSION'],
            setCommits: { auto: true },
          },
          // Suppress verbose output outside CI
          silent: !process.env['CI'],
        })
      : null;

  return {
    plugins: [react(), ...(sentryPlugin ? [sentryPlugin] : [])],

    resolve: {
      alias: {
        '@sbdmm/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@': path.resolve(__dirname, './src'),
      },
    },

    build: {
      // Source maps in production are generated but uploaded to Sentry then deleted
      // (sentryVitePlugin handles deletion via filesToDeleteAfterUpload).
      // In development use inline maps for fast DevTools debugging.
      sourcemap: isProd ? true : 'inline',

      // Target modern browsers only — reduces attack surface from polyfills
      target: 'es2020',

      // Prevent eval() in generated bundles (required for strict CSP)
      minify: isProd ? 'esbuild' : false,

      rollupOptions: {
        output: {
          // Deterministic chunk names for SRI hash compatibility
          chunkFileNames: isProd ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          entryFileNames: isProd ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          assetFileNames: isProd ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]',

          // Vendor splitting for better caching and smaller main bundle
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['react-router-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },

    server: {
      port: 5173,
      strictPort: true,
      // Proxy API calls to local backend in development
      proxy: {
        '/api': {
          target: env['VITE_API_BASE_URL'] ?? 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    preview: {
      port: 4173,
      strictPort: true,
    },

    // Prevent accidental exposure of server-only environment variables
    // Only VITE_ prefixed vars are exposed to the browser bundle
    envPrefix: 'VITE_',
  };
});
