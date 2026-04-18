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
 *   tag        — filter by a furniture category or tag (case-insensitive array contains)
 *   sort       — 'newest' (default) | 'price_asc' | 'price_desc' | 'popular'
 *   page       — page number (default 1)
 *   per_page   — items per page (default 24, max 60)
 *
 * GET /api/v1/feed/signals
 *   Returns tenant-wide aggregated social signals for the filter bar:
 *   - top_tags        — most-saved tags across all users
 *   - top_modes       — service modes ranked by save count
 *   - top_routes      — most-saved origin→destination pairs
 *   - collection_keywords — most common words in collection names (themes users care about)
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

// ─── Signals in-memory cache (60 s TTL per tenant) ───────────────────────────
interface CacheEntry { data: unknown; ts: number }
const signalsCache = new Map<string, CacheEntry>();
const SIGNALS_TTL_MS = 60_000;

// ─── Query schema ─────────────────────────────────────────────────────────────

const feedQuerySchema = z.object({
  q:        z.string().max(200).trim().optional(),
  tag:      z.string().max(100).trim().optional(),
  sort:     z.enum(['newest', 'price_asc', 'price_desc', 'popular']).optional().default('newest'),
  page:     z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(1).max(60).optional().default(24),
});

// ─── GET /api/v1/feed/signals ─────────────────────────────────────────────────
//
// Aggregates save activity across the whole tenant to surface:
//   top_tags          — tags most frequently saved (from saved_items.tags array)
//   top_modes         — service_mode ranked by how many times items were saved
//   top_routes        — origin→destination pairs ranked by save count
//   collection_keywords — significant words extracted from saved_collections.name
//
// Uses the admin client (service role) so it can read all users' saved_items
// without RLS filtering — this is intentional: these are tenant-wide popularity
// signals, not per-user private data.

router.get(
  '/signals',
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const tenantId = req.user!.tenant_id;

    // Serve from cache if fresh
    const cached = signalsCache.get(tenantId);
    if (cached && Date.now() - cached.ts < SIGNALS_TTL_MS) {
      res.status(200).json(cached.data);
      return;
    }

    try {
      // Run all aggregation queries in parallel
      const [itemsRes, collectionsRes] = await Promise.all([
        // All saved items for this tenant (across all users)
        supabase
          .from('saved_items')
          .select('service_mode, origin_region, destination_region, tags')
          .eq('tenant_id', tenantId),

        // All collection names for this tenant (across all users)
        supabase
          .from('saved_collections')
          .select('name')
          .eq('tenant_id', tenantId),
      ]);

      if (itemsRes.error) {
        log.error('[FEED/SIGNALS] saved_items query failed', { error: itemsRes.error.message });
        throw new AppError('Failed to load feed signals.', 500);
      }

      const savedItems  = itemsRes.data  ?? [];
      const collections = collectionsRes.data ?? [];

      // ── Aggregate top tags ─────────────────────────────────────────────────
      const tagCount = new Map<string, number>();
      for (const item of savedItems) {
        for (const tag of (item.tags as string[] | null) ?? []) {
          const t = tag.toLowerCase().trim();
          if (t) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
        }
      }
      const topTags = [...tagCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([tag, count]) => ({ tag, count }));

      // ── Aggregate top service modes ────────────────────────────────────────
      const modeCount = new Map<string, number>();
      for (const item of savedItems) {
        if (item.service_mode) {
          const m = (item.service_mode as string).toUpperCase();
          modeCount.set(m, (modeCount.get(m) ?? 0) + 1);
        }
      }
      const topModes = [...modeCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([mode, count]) => ({ mode, count }));

      // ── Aggregate top routes ───────────────────────────────────────────────
      const routeCount = new Map<string, number>();
      for (const item of savedItems) {
        if (item.origin_region && item.destination_region) {
          const key = `${item.origin_region as string}→${item.destination_region as string}`;
          routeCount.set(key, (routeCount.get(key) ?? 0) + 1);
        }
      }
      const topRoutes = [...routeCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([route, count]) => {
          const [origin, destination] = route.split('→');
          return { route, origin, destination, count };
        });

      // ── Extract collection name keywords ───────────────────────────────────
      // Tokenise collection names, strip stop-words, rank by frequency
      const STOP_WORDS = new Set([
        'a','an','the','and','or','of','in','for','my','our','new','old',
        'to','at','by','on','is','it','its','be','as','are','was','i',
        'items','stuff','things','collection','board','list','saved','general',
      ]);
      const wordCount = new Map<string, number>();
      for (const col of collections) {
        const words = (col.name as string)
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 2 && !STOP_WORDS.has(w));
        for (const w of words) {
          wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
        }
      }
      const collectionKeywords = [...wordCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword, count]) => ({ keyword, count }));

      res.status(200).json({
        success: true,
        data: {
          top_tags:             topTags,
          top_modes:            topModes,
          top_routes:           topRoutes,
          collection_keywords:  collectionKeywords,
          total_saves:          savedItems.length,
          total_collections:    collections.length,
        },
        meta: {
          request_id:  req.requestId,
          timestamp:   new Date().toISOString(),
          tenant_id:   tenantId,
        },
      });

      // Populate cache (after send to avoid blocking)
      const payload = {
        success: true,
        data: {
          top_tags: topTags, top_modes: topModes, top_routes: topRoutes,
          collection_keywords: collectionKeywords,
          total_saves: savedItems.length, total_collections: collections.length,
        },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString(), tenant_id: tenantId },
      };
      signalsCache.set(tenantId, { data: payload, ts: Date.now() });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error('[FEED/SIGNALS] Unexpected error', { err });
      throw new AppError('Failed to load feed signals.', 500);
    }
  },
);

// ─── GET /api/v1/feed ─────────────────────────────────────────────────────────

router.get(
  '/',
  validate(feedQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { q, tag, sort, page, per_page } = req.query as unknown as z.infer<typeof feedQuerySchema>;
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
        save_count,
        media_urls,
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

    // Tag filter — filter items where the tags array contains the given tag (case-insensitive)
    if (tag) {
      // cs = "contains" operator on array columns in Supabase
      query = query.contains('tags', [tag.toLowerCase()]);
    }

    // Sorting
    // 'popular' = order by how many times items have been saved across the tenant.
    // We achieve this by joining a subquery count — Supabase JS doesn't support
    // window functions directly, so for 'popular' we fall back to newest ordering
    // and let the /signals endpoint surface the popularity data to the frontend.
    switch (sort) {
      case 'price_asc':
        query = query
          .order('base_price_amount', { ascending: true, nullsFirst: false });
        break;
      case 'price_desc':
        query = query
          .order('base_price_amount', { ascending: false, nullsFirst: false });
        break;
      case 'popular':
        query = query.order('save_count', { ascending: false });
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
        filters: { q: q ?? null, tag: tag ?? null, sort },
      },
    });
  },
);

export { router as feedRouter };
