/**
 * Dashboard Stats Route
 *
 * Provides a single aggregated summary endpoint for the frontend dashboard.
 * All queries are tenant-scoped from req.user — never from client input.
 *
 * SECURITY: This route is read-only. No writes happen here.
 * All counts are filtered by tenant_id from the authenticated user context.
 * Compliance alert count exposes only a NUMBER — not the alert details.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError } from '../middleware/errorHandler';
import type { DashboardStats } from '@sbdmm/shared';

const router = Router();

router.use(requireAuth);

// ─── GET /api/v1/dashboard/stats ──────────────────────────────────────────────
router.get(
  '/stats',
  requireRole(['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin']),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const tenantId = req.user!.tenant_id;
    const userRole = req.user!.role;
    const userId = req.user!.id;

    try {
      // All queries run in parallel for performance
      const [
        ordersResult,
        pendingOrdersResult,
        vendorsResult,
        complianceResult,
        quotesResult,
        docsResult,
      ] = await Promise.all([
        // Total orders — scoped by role
        (() => {
          let q = supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);
          // Buyers only see their own orders
          if (userRole === 'buyer') q = q.eq('created_by', userId);
          // Logistics providers only see assigned orders
          if (userRole === 'logistics_provider') q = q.eq('assigned_provider_id', userId);
          return q;
        })(),

        // Pending orders (status = pending_quote or quoted)
        (() => {
          let q = supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .in('status', ['pending_quote', 'quoted', 'draft']);
          if (userRole === 'buyer') q = q.eq('created_by', userId);
          if (userRole === 'logistics_provider') q = q.eq('assigned_provider_id', userId);
          return q;
        })(),

        // Active vendors (only visible to tenant_admin and super_admin)
        userRole === 'tenant_admin' || userRole === 'super_admin'
          ? supabase
              .from('vendors')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId)
              .eq('status', 'approved')
          : Promise.resolve({ count: 0, error: null }),

        // Compliance alerts — failed or manual_review compliance results
        supabase
          .from('compliance_results')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('overall_status', ['failed', 'manual_review']),

        // Open quotes
        (() => {
          let q = supabase
            .from('quotes')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'pending');
          // Vendors only see their own quotes
          if (userRole === 'vendor') q = q.eq('created_by', userId);
          return q;
        })(),

        // Documents pending review (documents without a compliance_status = passed)
        supabase
          .from('trade_documents')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('review_status', 'pending'),
      ]);

      // Check for critical query failures
      if (ordersResult.error) {
        log.error('[DASHBOARD] Orders count failed', { error: ordersResult.error.message });
        throw new AppError('Failed to load dashboard statistics.', 500);
      }

      const stats: DashboardStats = {
        total_orders: ordersResult.count ?? 0,
        pending_orders: pendingOrdersResult.count ?? 0,
        active_vendors: vendorsResult.count ?? 0,
        compliance_alerts: complianceResult.count ?? 0,
        open_quotes: quotesResult.count ?? 0,
        documents_pending: docsResult.count ?? 0,
      };

      res.status(200).json({
        success: true,
        data: stats,
        meta: {
          request_id: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error('[DASHBOARD] Unexpected error', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError('Failed to load dashboard statistics.', 500);
    }
  },
);

export { router as dashboardRouter };
