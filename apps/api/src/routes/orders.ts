/**
 * Logistics Orders Route — Tenant-Scoped CRUD
 *
 * SECURITY PATTERNS DEMONSTRATED HERE:
 * 1. Authentication required on all routes (requireAuth)
 * 2. Role-based access (requireRole) — only permitted roles can create/update orders
 * 3. Tenant isolation — every query filters by req.user.tenant_id
 * 4. IDOR prevention — resource tenant_id is verified against authenticated user
 * 5. Input validation via Zod (validate middleware)
 * 6. No mass assignment — only permitted fields are written to DB
 * 7. Audit logging on state-changing operations
 * 8. Idempotency key support on creates
 * 9. server-side tenant_id injection — client cannot set their own tenant_id
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole, assertTenantOwnership } from '../middleware/authorization';
import { validate } from '../schemas/index';
import { createOrderSchema, updateOrderStatusSchema, paginationSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { ERROR_CODES } from '@sbdmm/shared';
import { AppError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

// All routes in this file require authentication
router.use(requireAuth);

// ─── List Orders ─────────────────────────────────────────────────────────────
// Returns all orders for the authenticated user's tenant
router.get(
  '/',
  requireRole(['buyer', 'vendor', 'logistics_provider', 'tenant_admin']),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const rawQuery = req.query as unknown as { page: number; per_page: number };
    const { page, per_page } = rawQuery;
    const offset = (page - 1) * per_page;

    const supabase = getAdminClient();

    // SECURITY: tenant_id filter is ALWAYS applied from req.user — never from client
    // Even with RLS, we add server-side filter as defence-in-depth
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.user!.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    // Role-based visibility: logistics_providers only see assigned orders
    if (req.user!.role === 'logistics_provider') {
      query = query.eq('assigned_provider_id', req.user!.id);
    }

    // Buyers only see their own orders
    if (req.user!.role === 'buyer') {
      query = query.eq('created_by', req.user!.id);
    }

    const { data, error, count } = await query;

    if (error) {
      log.error('[ORDERS] List query failed', { error: error.message });
      throw new AppError('Failed to retrieve orders.', 500);
    }

    res.status(200).json({
      success: true,
      data,
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          page,
          per_page,
          total: count ?? 0,
          total_pages: Math.ceil((count ?? 0) / per_page),
        },
      },
    });
  },
);

// ─── Get Single Order ─────────────────────────────────────────────────────────
router.get(
  '/:orderId',
  requireRole(['buyer', 'vendor', 'logistics_provider', 'tenant_admin']),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { orderId } = req.params as { orderId: string };

    // Validate orderId format to prevent injection
    if (!/^[0-9a-f-]{36}$/.test(orderId)) {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid order ID format.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: order, error } = await getAdminClient()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    // SECURITY: IDOR check — ensure this order belongs to the user's tenant
    if (!assertTenantOwnership(req, order.tenant_id as string, res)) return;

    // Additional check for buyers — they can only see their own orders
    if (req.user!.role === 'buyer' && order.created_by !== req.user!.id) {
      log.warn('[ORDERS] Buyer attempted to access another user\'s order', {
        user_id: req.user!.id,
        order_id: orderId,
      });
      throw new NotFoundError('Order'); // Return 404, not 403, to avoid resource enumeration
    }

    res.status(200).json({
      success: true,
      data: order,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── Create Order ─────────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(['buyer', 'vendor']),
  validate(createOrderSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const body = req.body as Record<string, unknown>;

    // Idempotency: check if we've already processed this request
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const { data: existing } = await getAdminClient()
        .from('orders')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .eq('tenant_id', req.user!.tenant_id)
        .single();

      if (existing) {
        log.info('[ORDERS] Idempotent create — returning existing order', {
          idempotency_key: idempotencyKey,
        });
        res.status(200).json({
          success: true,
          data: existing,
          meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
        });
        return;
      }
    }

    // SECURITY: Build insert record server-side.
    // tenant_id and created_by are ALWAYS set from req.user — never from request body.
    // This prevents privilege escalation / tenant spoofing.
    const newOrder = {
      ...body,
      tenant_id: req.user!.tenant_id,  // Server-injected — never trust client
      created_by: req.user!.id,         // Server-injected
      status: 'draft',                   // Default status — client cannot set initial status
      idempotency_key: idempotencyKey ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: order, error } = await getAdminClient()
      .from('orders')
      .insert(newOrder)
      .select()
      .single();

    if (error) {
      log.error('[ORDERS] Create failed', { error: error.message });
      throw new AppError('Failed to create order.', 500);
    }

    await writeAuditLog({
      event_type: 'order.created',
      actor_id: req.user!.id,
      tenant_id: req.user!.tenant_id,
      target_type: 'order',
      target_id: order.id as string,
      outcome: 'success',
      request_id: req.requestId,
    });

    log.info('[ORDERS] Order created', { order_id: order.id });

    res.status(201).json({
      success: true,
      data: order,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── Update Order Status ───────────────────────────────────────────────────────
router.patch(
  '/:orderId/status',
  requireRole(['logistics_provider', 'tenant_admin']),
  validate(updateOrderStatusSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { orderId } = req.params as { orderId: string };
    const { status, notes } = req.body as { status: string; notes?: string };

    // Fetch existing order to verify tenant ownership before update
    const { data: existing, error: fetchError } = await getAdminClient()
      .from('orders')
      .select('id, tenant_id, status')
      .eq('id', orderId)
      .single();

    if (fetchError || !existing) throw new NotFoundError('Order');

    if (!assertTenantOwnership(req, existing.tenant_id as string, res)) return;

    // SECURITY: Only update the fields we explicitly allow — no spread of req.body
    const { data: updated, error: updateError } = await getAdminClient()
      .from('orders')
      .update({
        status,
        updated_by: req.user!.id,
        updated_at: new Date().toISOString(),
        ...(notes ? { notes } : {}),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      log.error('[ORDERS] Status update failed', { error: updateError.message });
      throw new AppError('Failed to update order status.', 500);
    }

    await writeAuditLog({
      event_type: 'order.status_changed',
      actor_id: req.user!.id,
      tenant_id: req.user!.tenant_id,
      target_type: 'order',
      target_id: orderId,
      outcome: 'success',
      details: {
        previous_status: existing.status,
        new_status: status,
      },
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: updated,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

export { router as ordersRouter };
