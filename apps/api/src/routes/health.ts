/**
 * Health and Readiness Routes
 *
 * SECURITY DESIGN:
 * - /health — liveness probe: returns 200 if the process is alive
 * - /ready  — readiness probe: returns 200 only if all dependencies are available
 *
 * SECURITY: Do NOT expose sensitive information in health endpoints.
 * These endpoints are intentionally public (no auth required) for load balancer
 * and container orchestration health checks.
 *
 * HUMAN DECISION: Do not return database connection strings, version numbers,
 * internal hostnames, or secret configuration in health response bodies.
 * The version string below should be the git commit SHA for release tracking,
 * not the full package version if that reveals internal details.
 */

import { Router, Request, Response } from 'express';
import { getAdminClient } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

const router = Router();

// ─── Liveness Probe ───────────────────────────────────────────────────────────
// Returns 200 if the process is running. Used by container orchestrators.
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // SECURITY: Only expose safe metadata — no versions, no env details
    service: 'sbdmm-api',
  });
});

// ─── Readiness Probe ──────────────────────────────────────────────────────────
// Returns 200 only when the server can serve traffic (DB reachable, etc.)
// Returns 503 if any critical dependency is unavailable.
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  try {
    // Check Supabase database connectivity
    const { error } = await getAdminClient()
      .from('tenants')
      .select('id')
      .limit(1);

    checks['database'] = error ? 'error' : 'ok';
  } catch (err) {
    logger.error('[HEALTH] Database readiness check failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    checks['database'] = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
