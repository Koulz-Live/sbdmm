/**
 * Ratings Route — Vendor post-delivery ratings
 *
 * POST /api/v1/ratings              — buyer submits a 1–5 star rating after order is delivered
 * GET  /api/v1/vendors/:id/ratings  — public summary: avg rating, total reviews (mounted in vendors router)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../schemas/index';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

const createRatingSchema = z.object({
  vendor_id: z.string().uuid(),
  order_id:  z.string().uuid(),
  rating:    z.number().int().min(1).max(5),
  comment:   z.string().max(1000).trim().optional(),
});

// ─── POST /api/v1/ratings ─────────────────────────────────────────────────────

router.post(
  '/',
  validate(createRatingSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const tenantId = req.user!.tenant_id;
    const userId   = req.user!.id;
    const { vendor_id, order_id, rating, comment } = req.body as z.infer<typeof createRatingSchema>;

    // Only buyers / tenant_admin can rate
    const role = req.user!.role;
    if (role !== 'buyer' && role !== 'tenant_admin' && role !== 'super_admin') {
      throw new AppError('Only buyers can submit ratings.', 403);
    }

    // Verify order is delivered and belongs to this buyer's tenant
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, tenant_id, created_by')
      .eq('id', order_id)
      .eq('tenant_id', tenantId)
      .single();

    if (orderErr || !order) throw new AppError('Order not found.', 404);
    if (order.status !== 'delivered') throw new AppError('You can only rate delivered orders.', 422);

    const { data: ratingRow, error: insertErr } = await supabase
      .from('vendor_ratings')
      .insert({ vendor_id, order_id, tenant_id: tenantId, rated_by: userId, rating, comment })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') throw new AppError('You have already rated this order.', 409);
      log.error('[RATINGS] Insert failed', { error: insertErr.message });
      throw new AppError('Failed to submit rating.', 500);
    }

    log.info('[RATINGS] Rating submitted', { vendor_id, order_id, rating });
    res.status(201).json({ success: true, data: ratingRow });
  },
);

// ─── GET /api/v1/ratings/vendor/:vendorId — rating summary ────────────────────

router.get(
  '/vendor/:vendorId',
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getAdminClient();
    const { vendorId } = req.params;
    const tenantId = req.user!.tenant_id;

    const { data, error } = await supabase
      .from('vendor_ratings')
      .select('rating, comment, created_at, rated_by')
      .eq('vendor_id', vendorId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw new AppError('Failed to load ratings.', 500);

    const rows = data ?? [];
    const avg  = rows.length > 0
      ? rows.reduce((s, r) => s + (r.rating as number), 0) / rows.length
      : null;

    res.status(200).json({
      success: true,
      data: {
        vendor_id:    vendorId,
        total_ratings: rows.length,
        avg_rating:   avg !== null ? Math.round(avg * 10) / 10 : null,
        reviews: rows.map(r => ({
          rating: r.rating,
          comment: r.comment,
          created_at: r.created_at,
        })),
      },
    });
  },
);

export { router as ratingsRouter };
