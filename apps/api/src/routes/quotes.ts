/**
 * Quotes Route — Vendor Bids on Logistics Orders
 *
 * SECURITY PATTERNS:
 * 1. Only vendors can CREATE quotes
 * 2. Only the buyer who owns the order can ACCEPT or REJECT a quote
 * 3. Accepting a quote auto-rejects all other open quotes on that order
 * 4. Quote price and validity cannot be changed after creation (immutable)
 * 5. All transitions are audit-logged
 * 6. tenant_id always injected server-side
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { validate, createQuoteSchema, paginationSchema, uuidSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ERROR_CODES } from '@sbdmm/shared';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const quoteParamsSchema = z.object({ id: uuidSchema });

const quoteActionSchema = z
  .object({
    action: z.enum(['accept', 'reject', 'withdraw']),
    reason: z.string().max(1000).trim().optional(),
  })
  .strict();

// ─── GET /api/v1/quotes ────────────────────────────────────────────────────────
// List quotes — scoped by role:
//   vendors see their own quotes
//   buyers/tenant_admins see quotes on their tenant's orders
router.get(
  '/',
  requireRole(['buyer', 'vendor', 'tenant_admin', 'super_admin']),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page } = req.query as unknown as { page: number; per_page: number };
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();
    const actor = req.user!;

    let query = supabase
      .from('quotes')
      .select('*', { count: 'exact' })
      .eq('tenant_id', actor.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    // Vendors only see their own quotes
    if (actor.role === 'vendor') {
      query = query.eq('created_by', actor.id);
    }

    const { data, error, count } = await query;

    if (error) {
      log.error('[QUOTES] List query failed', { error: error.message });
      throw new AppError('Failed to retrieve quotes.', 500);
    }

    res.status(200).json({
      success: true,
      data,
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: { page, per_page, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / per_page) },
      },
    });
  },
);

// ─── GET /api/v1/quotes/:id ────────────────────────────────────────────────────
router.get(
  '/:id',
  requireRole(['buyer', 'vendor', 'tenant_admin', 'super_admin']),
  validate(quoteParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (error || !data) {
      log.warn('[QUOTES] Not found', { quote_id: req.params['id'] });
      throw new NotFoundError('Quote not found.');
    }

    // Vendors can only see their own quotes
    if (actor.role === 'vendor' && data.created_by !== actor.id) {
      res.status(403).json({
        success: false,
        error: { code: ERROR_CODES.FORBIDDEN, message: 'Access denied.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/quotes ───────────────────────────────────────────────────────
// Only vendors can create quotes
router.post(
  '/',
  requireRole(['vendor']),
  validate(createQuoteSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const body = req.body as { order_id: string; price_amount: number; price_currency: string; transit_days_estimated: number; valid_until: string; notes?: string; route_details?: Record<string, unknown> };

    // Verify the order exists and belongs to the same tenant
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, tenant_id, status')
      .eq('id', body.order_id)
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (orderError || !order) throw new NotFoundError('Order not found.');

    // Only accept quotes on orders that are open for quoting
    if (!['pending_quote', 'quoted'].includes(order.status as string)) {
      res.status(409).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'This order is not accepting quotes.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Check vendor hasn't already quoted this order
    const { count: existingCount } = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', body.order_id)
      .eq('created_by', actor.id)
      .eq('status', 'pending');

    if ((existingCount ?? 0) > 0) {
      res.status(409).json({
        success: false,
        error: { code: ERROR_CODES.IDEMPOTENCY_CONFLICT, message: 'You have already submitted a quote for this order.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const quotePayload = {
      ...body,
      tenant_id: actor.tenant_id,
      created_by: actor.id,
      status: 'pending',
    };

    const { data: quote, error: insertError } = await supabase
      .from('quotes')
      .insert(quotePayload)
      .select()
      .single();

    if (insertError || !quote) {
      log.error('[QUOTES] Insert failed', { error: insertError?.message });
      throw new AppError('Failed to submit quote.', 500);
    }

    // Update order status to 'quoted' if it was pending
    if (order.status === 'pending_quote') {
      await supabase.from('orders').update({ status: 'quoted' }).eq('id', body.order_id);
    }

    await writeAuditLog({
      event_type: 'quote.created',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'quote',
      target_id: quote.id as string,
      outcome: 'success',
      details: { order_id: body.order_id, price_amount: body.price_amount, currency: body.price_currency },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: quote,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/quotes/:id/action ───────────────────────────────────────────
// Accept, reject, or withdraw a quote
// Buyers accept/reject; vendors withdraw their own
router.post(
  '/:id/action',
  requireRole(['buyer', 'vendor', 'tenant_admin']),
  validate(quoteParamsSchema, 'params'),
  validate(quoteActionSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const { action, reason } = req.body as { action: 'accept' | 'reject' | 'withdraw'; reason?: string };

    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('*, orders!inner(created_by, tenant_id)')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (fetchError || !quote) throw new NotFoundError('Quote not found.');
    if (quote.status !== 'pending') {
      res.status(409).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Quote is already ${quote.status as string}.` },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Permission gate: only vendor can withdraw their own quote
    if (action === 'withdraw') {
      if (actor.role !== 'vendor' || quote.created_by !== actor.id) {
        res.status(403).json({
          success: false,
          error: { code: ERROR_CODES.FORBIDDEN, message: 'Only the quoting vendor may withdraw this quote.' },
          meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
        });
        return;
      }
    }

    // Permission gate: only buyer (order owner) or tenant_admin can accept/reject
    if (action === 'accept' || action === 'reject') {
      const order = quote.orders as { created_by: string; tenant_id: string } | null;
      const isOrderOwner = order?.created_by === actor.id;
      const isAdmin = actor.role === 'tenant_admin' || actor.role === 'super_admin';
      if (!isOrderOwner && !isAdmin) {
        res.status(403).json({
          success: false,
          error: { code: ERROR_CODES.FORBIDDEN, message: 'Only the order owner may accept or reject quotes.' },
          meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
        });
        return;
      }
    }

    const newStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'withdrawn';

    const { data: updatedQuote, error: updateError } = await supabase
      .from('quotes')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', req.params['id'])
      .select()
      .single();

    if (updateError) {
      log.error('[QUOTES] Status update failed', { error: updateError.message });
      throw new AppError('Failed to update quote.', 500);
    }

    // If accepted: reject all other pending quotes on the same order and confirm the order
    if (action === 'accept') {
      await supabase
        .from('quotes')
        .update({ status: 'rejected' })
        .eq('order_id', quote.order_id as string)
        .eq('status', 'pending')
        .neq('id', req.params['id']);

      await supabase
        .from('orders')
        .update({ status: 'confirmed' })
        .eq('id', quote.order_id as string);
    }

    const auditEvent = action === 'accept'
      ? 'quote.accepted'
      : 'quote.rejected' as const;

    await writeAuditLog({
      event_type: auditEvent,
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'quote',
      target_id: req.params['id'] ?? '',
      outcome: 'success',
      details: { action, ...(reason ? { reason } : {}) },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: updatedQuote,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

export { router as quotesRouter };
