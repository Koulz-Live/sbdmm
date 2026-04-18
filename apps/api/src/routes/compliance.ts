/**
 * Compliance Route — Evaluation Trigger & Results
 *
 * SECURITY DESIGN:
 * 1. Compliance evaluation can only be triggered by tenant_admin or super_admin
 * 2. Results are tenant-scoped — no cross-tenant visibility (except super_admin)
 * 3. Manual review actions are fully audit-logged
 * 4. Compliance decisions are NEVER delegated to the AI model (see complianceEngine.ts)
 * 5. The results endpoint returns only the latest evaluation per context
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { validate, uuidSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';
import { evaluateCompliance } from '../compliance/complianceEngine';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const resultParamsSchema = z.object({ orderId: uuidSchema });
const contextParamsSchema = z.object({ contextId: uuidSchema });

const triggerEvaluationSchema = z
  .object({
    context_type: z.enum(['order', 'vendor_onboarding', 'document_upload', 'quote']),
    context_id: uuidSchema,
  })
  .strict();

const reviewActionSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    notes: z.string().max(2000).trim().optional(),
  })
  .strict();

// ─── POST /api/v1/compliance/evaluate ─────────────────────────────────────────
router.post(
  '/evaluate',
  requireRole(['tenant_admin', 'super_admin']),
  validate(triggerEvaluationSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const actor = req.user!;
    const { context_type, context_id } = req.body as { context_type: 'order' | 'vendor_onboarding' | 'document_upload' | 'quote'; context_id: string };

    log.info('[COMPLIANCE] Manual evaluation triggered', { context_type, context_id });

    const result = await evaluateCompliance({
      tenant_id: actor.tenant_id,
      actor_id: actor.id,
      context_type,
      context_id,
      data: { manually_triggered: true },
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: result,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/compliance/results ───────────────────────────────────────────
// Returns a paginated list of all compliance results for the tenant
router.get(
  '/results',
  requireRole(['tenant_admin', 'super_admin']),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const perPage = Math.min(Number(req.query['per_page'] ?? 50), 100);
    const page = Math.max(Number(req.query['page'] ?? 1), 1);
    const offset = (page - 1) * perPage;

    const tenantFilter = actor.role === 'super_admin'
      ? supabase.from('compliance_results').select('*', { count: 'exact' })
      : supabase.from('compliance_results').select('*', { count: 'exact' }).eq('tenant_id', actor.tenant_id);

    const { data, error, count } = await tenantFilter
      .order('evaluated_at', { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      log.error('[COMPLIANCE] List query failed', { error: error.message });
      throw new AppError('Failed to retrieve compliance results.', 500);
    }

    res.status(200).json({
      success: true,
      data: data ?? [],
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: { page, per_page: perPage, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / perPage) },
      },
    });
  },
);

// ─── GET /api/v1/compliance/results/:orderId ──────────────────────────────────
// Returns compliance results for an order (all checks)
router.get(
  '/results/:orderId',
  requireRole(['buyer', 'tenant_admin', 'super_admin', 'logistics_provider']),
  validate(resultParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    // Verify the order belongs to actor's tenant (IDOR check)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, tenant_id, created_by')
      .eq('id', req.params['orderId'])
      .single();

    if (orderError || !order) throw new NotFoundError('Order not found.');

    // Buyers can only see their own orders' compliance results
    if (actor.role === 'buyer' && order.created_by !== actor.id) {
      const supabaseAdmin = getAdminClient();
      const _ = supabaseAdmin; // satisfy linter
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // super_admin can see cross-tenant; others must match tenant
    if (actor.role !== 'super_admin' && order.tenant_id !== actor.tenant_id) {
      throw new NotFoundError('Order not found.');
    }

    const { data: results, error: resultsError } = await supabase
      .from('compliance_results')
      .select('*')
      .eq('context_id', req.params['orderId'])
      .eq('context_type', 'order')
      .order('evaluated_at', { ascending: false });

    if (resultsError) {
      log.error('[COMPLIANCE] Results query failed', { error: resultsError.message });
      throw new AppError('Failed to retrieve compliance results.', 500);
    }

    res.status(200).json({
      success: true,
      data: results,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/compliance/context/:contextId ────────────────────────────────
// Latest compliance result for any context (vendor, document, quote, order)
router.get(
  '/context/:contextId',
  requireRole(['tenant_admin', 'super_admin']),
  validate(contextParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data, error } = await supabase
      .from('compliance_results')
      .select('*')
      .eq('context_id', req.params['contextId'])
      .eq('tenant_id', actor.tenant_id)
      .order('evaluated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) throw new NotFoundError('No compliance result found for this context.');

    res.status(200).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/compliance/context/:contextId/review ────────────────────────
// Manually approve or reject a compliance result that requires manual_review
router.post(
  '/context/:contextId/review',
  requireRole(['tenant_admin', 'super_admin']),
  validate(contextParamsSchema, 'params'),
  validate(reviewActionSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const { action, notes } = req.body as { action: 'approve' | 'reject'; notes?: string };

    const { data: result, error: fetchError } = await supabase
      .from('compliance_results')
      .select('id, tenant_id, overall_status, context_id, context_type')
      .eq('context_id', req.params['contextId'])
      .eq('tenant_id', actor.tenant_id)
      .order('evaluated_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !result) throw new NotFoundError('Compliance result not found.');

    if (result.overall_status !== 'manual_review') {
      res.status(409).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'This result is not pending manual review.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const newStatus = action === 'approve' ? 'passed' : 'failed';

    const { data: updated, error: updateError } = await supabase
      .from('compliance_results')
      .update({
        overall_status: newStatus,
        reviewed_by: actor.id,
        reviewed_at: new Date().toISOString(),
        ...(notes ? { review_notes: notes } : {}),
      })
      .eq('id', result.id as string)
      .select()
      .single();

    if (updateError) {
      log.error('[COMPLIANCE] Review update failed', { error: updateError.message });
      throw new AppError('Failed to record review decision.', 500);
    }

    await writeAuditLog({
      event_type: action === 'approve' ? 'compliance.check_passed' : 'compliance.check_failed',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: result.context_type as string,
      target_id: result.context_id as string,
      outcome: 'success',
      details: { action, new_status: newStatus, ...(notes ? { notes } : {}) },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: updated,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

export { router as complianceRouter };
