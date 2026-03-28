/**
 * Secure Headers Middleware
 *
 * SECURITY: Uses Helmet.js to set HTTP security headers.
 * These headers are a low-cost, high-value defence layer.
 *
 * DECISIONS DOCUMENTED INLINE:
 * - CSP is intentionally strict; you MUST update it when adding CDNs or fonts
 * - HSTS enforces HTTPS — do not enable preload until you are committed to HTTPS permanently
 * - X-Frame-Options prevents clickjacking attacks
 * - Referrer-Policy minimises information leakage to third-party sites
 *
 * HUMAN DECISION: Review CSP directives before adding any third-party scripts,
 * analytics, fonts, or embedded iframes. Every new source must be explicitly listed.
 */

import helmet from 'helmet';
import { config } from '../lib/config';

const isProd = config.server.nodeEnv === 'production';

export const secureHeaders = helmet({
  // Content Security Policy
  // HUMAN DECISION: This is a restrictive default. Update script-src, img-src,
  // connect-src as you add frontend integrations (analytics, maps, etc.)
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Needed for Vite in dev; tighten in prod
      imgSrc: ["'self'", 'data:', 'https://cdn.supabase.co'],
      connectSrc: [
        "'self'",
        'https://*.supabase.co',
        'https://api.openai.com', // Only via our proxy — this is the server API, not browser
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"], // Prevent clickjacking
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },

  // HTTP Strict Transport Security
  // SECURITY: Forces HTTPS for 1 year. Do NOT enable preload without reading
  // https://hstspreload.org — it's a very hard commitment to undo.
  hsts: isProd
    ? {
        maxAge: 31_536_000, // 1 year in seconds
        includeSubDomains: true,
        preload: false, // HUMAN DECISION: Enable preload only after full HTTPS commitment
      }
    : false,

  // Prevent MIME type sniffing
  noSniff: true,

  // Prevent clickjacking via iframe embedding
  frameguard: { action: 'deny' },

  // Disable X-Powered-By: Express (reduces fingerprinting)
  hidePoweredBy: true,

  // Cross-origin resource policy
  crossOriginResourcePolicy: { policy: 'same-site' },

  // Cross-origin opener policy — isolates browsing context
  crossOriginOpenerPolicy: { policy: 'same-origin' },

  // Cross-origin embedder policy
  crossOriginEmbedderPolicy: isProd ? { policy: 'require-corp' } : false,

  // Referrer policy — minimise referrer information leakage
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
