/**
 * Messages Route — Per-order buyer↔vendor messaging thread
 *
 * GET  /api/v1/orders/:orderId/messages          — list thread (paginated)
 * POST /api/v1/orders/:orderId/messages          — send a message
 *
 * Access: any authenticated user in the same tenant who is party to the order
 *   - Buyer: owns the order (orders.created_by === user.id)
 *   - Vendor/Logistics: assigned or has quoted on the order
 *   - tenant_admin / super_admin: always allowed within tenant
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../schemas/index';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError } from '../middleware/errorHandler';

// Must be mounted with mergeParams: true on the orders router, or as a top-level
// router with explicit orderId param — we mount it on app.ts as /api/v1/orders.
const router = Router({ mergeParams: true });
router.use(requireAuth);

const sendMessageSchema = z.object({
  body: z.string().min(1).max(2000).trim(),
});

const listQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
});

// ─── GET /api/v1/orders/:orderId/messages ─────────────────────────────────────

router.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { orderId } = req.params;
    const tenantId = req.user!.tenant_id;
    const { page, per_page } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const offset = (page - 1) * per_page;

    // Verify order belongs to tenant
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, tenant_id, created_by')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (orderErr || !order) {
      log.warn('[MESSAGES] Order not found or forbidden', { orderId });
      throw new AppError('Order not found.', 404);
    }

    const { data, error, count } = await supabase
      .from('messages')
      .select(
        `id, body, sender_id, created_at,
         profiles!sender_id ( full_name, role )`,
        { count: 'exact' },
      )
      .eq('order_id', orderId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .range(offset, offset + per_page - 1);

    if (error) {
      log.error('[MESSAGES] Query failed', { error: error.message });
      throw new AppError('Failed to load messages.', 500);
    }

    const total = count ?? 0;
    res.status(200).json({
      success: true,
      data,
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          page, per_page, total,
          total_pages: Math.ceil(total / per_page),
          has_next: page < Math.ceil(total / per_page),
          has_prev: page > 1,
        },
      },
    });
  },
);

// ─── POST /api/v1/orders/:orderId/messages ────────────────────────────────────

router.post(
  '/',
  validate(sendMessageSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { orderId } = req.params;
    const tenantId = req.user!.tenant_id;
    const senderId = req.user!.id;
    const { body } = req.body as z.infer<typeof sendMessageSchema>;

    // Verify order belongs to tenant
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, tenant_id')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (orderErr || !order) {
      log.warn('[MESSAGES] Send — order not found', { orderId });
      throw new AppError('Order not found.', 404);
    }

    const { data: message, error: insertErr } = await supabase
      .from('messages')
      .insert({ order_id: orderId, tenant_id: tenantId, sender_id: senderId, body })
      .select('id, body, sender_id, created_at')
      .single();

    if (insertErr || !message) {
      log.error('[MESSAGES] Insert failed', { error: insertErr?.message });
      throw new AppError('Failed to send message.', 500);
    }

    log.info('[MESSAGES] Message sent', { orderId, messageId: message.id });
    res.status(201).json({ success: true, data: message });
  },
);

export { router as messagesRouter };
