/**
 * Feed Route — Public Furniture / Catalogue Item Discovery
 *
 * GET /api/v1/feed
 *   Returns a paginated, searchable aggregation of all active catalogue items
 *   across all approved vendors in the user's tenant — joined with vendor info
 *   so the frontend can show "by <VendorName>" on each card.
 *
 * Query params:
 *   q          — free-text search (title, description, tags)
 *   mode       — filter by service_mode (FCL | LCL | AIR | ROAD | RAIL | COURIER | OTHER)
 *   sort       — 'newest' (default) | 'price_asc' | 'price_desc'
 *   page       — page number (default 1)
 *   per_page   — items per page (default 24, max 60)
 *
 * Accessible to: all authenticated users (any role)
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

// ─── Query schema ─────────────────────────────────────────────────────────────

const feedQuerySchema = z.object({
  q:        z.string().max(200).trim().optional(),
  mode:     z.enum(['FCL', 'LCL', 'AIR', 'ROAD', 'RAIL', 'COURIER', 'OTHER']).optional(),
  sort:     z.enum(['newest', 'price_asc', 'price_desc']).optional().default('newest'),
  page:     z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(1).max(60).optional().default(24),
});

// ─── GET /api/v1/feed ─────────────────────────────────────────────────────────

router.get(
  '/',
  validate(feedQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { q, mode, sort, page, per_page } = req.query as unknown as z.infer<typeof feedQuerySchema>;
    const tenantId = req.user!.tenant_id;

    const offset = (page - 1) * per_page;

    // Build query — join vendor info via FK
    // vendor_catalogue has vendor_id → vendors.id
    let query = supabase
      .from('vendor_catalogue')
      .select(
        `
        id,
        vendor_id,
        title,
        description,
        service_mode,
        origin_region,
        destination_region,
        transit_days_min,
        transit_days_max,
        base_price_amount,
        base_price_currency,
        price_unit,
        tags,
        created_at,
        vendors!inner (
          id,
          company_name,
          country_of_registration,
          business_category,
          status,
          website_url
        )
        `,
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      // Only items from approved vendors
      .eq('vendors.status', 'approved');

    // Free-text search across title, description and tags
    if (q) {
      // Supabase text search: use ilike on title+description, and overlaps on tags array
      query = query.or(
        `title.ilike.%${q}%,description.ilike.%${q}%`,
      );
    }

    // Mode filter
    if (mode) {
      query = query.eq('service_mode', mode);
    }

    // Sorting
    switch (sort) {
      case 'price_asc':
        query = query
          .order('base_price_amount', { ascending: true, nullsFirst: false });
        break;
      case 'price_desc':
        query = query
          .order('base_price_amount', { ascending: false, nullsFirst: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Pagination
    query = query.range(offset, offset + per_page - 1);

    const { data, error, count } = await query;

    if (error) {
      log.error('[FEED] Query failed', { error: error.message, tenantId });
      throw new AppError('Failed to load feed.', 500);
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / per_page);

    res.status(200).json({
      success: true,
      data: data ?? [],
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          page,
          per_page,
          total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
        filters: { q: q ?? null, mode: mode ?? null, sort },
      },
    });
  },
);

export { router as feedRouter };
