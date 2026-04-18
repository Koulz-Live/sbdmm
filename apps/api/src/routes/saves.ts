/**
 * Saves Route — User Saved Items & Collections
 *
 * Lets authenticated users bookmark catalogue items from the Home feed
 * into named personal collections (boards).
 *
 * ENDPOINTS:
 *
 *   Collections (boards):
 *     GET    /api/v1/saves/collections              → list user's collections
 *     POST   /api/v1/saves/collections              → create a collection
 *     PATCH  /api/v1/saves/collections/:id          → rename/describe a collection
 *     DELETE /api/v1/saves/collections/:id          → delete collection + all its items
 *
 *   Items:
 *     GET    /api/v1/saves/collections/:id/items    → list items in a collection
 *     POST   /api/v1/saves/items                    → save an item into a collection
 *     DELETE /api/v1/saves/items/:itemId            → unsave an item
 *     GET    /api/v1/saves/check/:catalogueItemId   → which collections contain this item
 *
 * SECURITY:
 *   - All rows scoped by auth.uid() via RLS + server-side user_id injection
 *   - tenant_id injected from req.user — never trusted from client
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../schemas/index';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { uuidSchema } from '../schemas/index';

const router = Router();
router.use(requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const collectionBodySchema = z.object({
  name:        z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
});

const collectionPatchSchema = z.object({
  name:        z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
}).refine(d => d.name !== undefined || d.description !== undefined, {
  message: 'Provide at least one field to update.',
});

const saveItemBodySchema = z.object({
  collection_id:       z.string().uuid(),
  catalogue_item_id:   z.string().uuid(),
  vendor_id:           z.string().uuid(),
  vendor_name:         z.string().min(1).max(200).trim(),
  title:               z.string().min(1).max(200).trim(),
  description:         z.string().max(2000).trim().optional(),
  service_mode:        z.string().min(1).max(20).trim(),
  origin_region:       z.string().min(1).max(100).trim(),
  destination_region:  z.string().min(1).max(100).trim(),
  transit_days_min:    z.number().int().min(1).optional(),
  transit_days_max:    z.number().int().min(1).optional(),
  base_price_amount:   z.number().nonnegative().optional(),
  base_price_currency: z.string().length(3).optional().default('USD'),
  price_unit:          z.string().max(50).trim().optional(),
  tags:                z.array(z.string().max(50)).max(20).optional().default([]),
  note:                z.string().max(500).trim().optional(),
});

const collectionParamsSchema = z.object({ id: uuidSchema });
const itemParamsSchema        = z.object({ itemId: uuidSchema });
const catalogueParamsSchema   = z.object({ catalogueItemId: uuidSchema });

// ─── GET /api/v1/saves/collections ───────────────────────────────────────────

router.get('/collections', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('saved_collections')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('updated_at', { ascending: false });

  if (error) {
    log.error('[SAVES] List collections failed', { error: error.message });
    throw new AppError('Failed to load collections.', 500);
  }

  res.status(200).json({ success: true, data: data ?? [] });
});

// ─── POST /api/v1/saves/collections ──────────────────────────────────────────

router.post(
  '/collections',
  validate(collectionBodySchema, 'body'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { name, description } = req.body as z.infer<typeof collectionBodySchema>;

    const { data, error } = await supabase
      .from('saved_collections')
      .insert({
        user_id:     req.user!.id,
        tenant_id:   req.user!.tenant_id,
        name,
        description: description ?? null,
      })
      .select()
      .single();

    if (error) {
      log.error('[SAVES] Create collection failed', { error: error.message });
      throw new AppError('Failed to create collection.', 500);
    }

    res.status(201).json({ success: true, data });
  },
);

// ─── PATCH /api/v1/saves/collections/:id ─────────────────────────────────────

router.patch(
  '/collections/:id',
  validate(collectionParamsSchema, 'params'),
  validate(collectionPatchSchema, 'body'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { name, description } = req.body as z.infer<typeof collectionPatchSchema>;

    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch['name'] = name;
    if (description !== undefined) patch['description'] = description;

    const { data, error } = await supabase
      .from('saved_collections')
      .update(patch)
      .eq('id', req.params['id'])
      .eq('user_id', req.user!.id)    // ownership check
      .select()
      .single();

    if (error || !data) {
      if (!data) throw new NotFoundError('Collection not found.');
      log.error('[SAVES] Update collection failed', { error: error?.message });
      throw new AppError('Failed to update collection.', 500);
    }

    res.status(200).json({ success: true, data });
  },
);

// ─── DELETE /api/v1/saves/collections/:id ────────────────────────────────────

router.delete(
  '/collections/:id',
  validate(collectionParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { error, count } = await supabase
      .from('saved_collections')
      .delete({ count: 'exact' })
      .eq('id', req.params['id'])
      .eq('user_id', req.user!.id);

    if (error) {
      log.error('[SAVES] Delete collection failed', { error: error.message });
      throw new AppError('Failed to delete collection.', 500);
    }
    if (count === 0) throw new NotFoundError('Collection not found.');

    res.status(200).json({ success: true, message: 'Collection deleted.' });
  },
);

// ─── GET /api/v1/saves/collections/:id/items ─────────────────────────────────

router.get(
  '/collections/:id/items',
  validate(collectionParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    // Verify ownership of the collection first
    const { data: col, error: colErr } = await supabase
      .from('saved_collections')
      .select('id, name')
      .eq('id', req.params['id'])
      .eq('user_id', req.user!.id)
      .single();

    if (colErr || !col) throw new NotFoundError('Collection not found.');

    const { data, error } = await supabase
      .from('saved_items')
      .select('*')
      .eq('collection_id', req.params['id'])
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      log.error('[SAVES] List items failed', { error: error.message });
      throw new AppError('Failed to load items.', 500);
    }

    res.status(200).json({ success: true, data: data ?? [], meta: { collection: col } });
  },
);

// ─── POST /api/v1/saves/items ────────────────────────────────────────────────

router.post(
  '/items',
  validate(saveItemBodySchema, 'body'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const body = req.body as z.infer<typeof saveItemBodySchema>;

    // Verify the collection belongs to this user
    const { data: col, error: colErr } = await supabase
      .from('saved_collections')
      .select('id')
      .eq('id', body.collection_id)
      .eq('user_id', req.user!.id)
      .single();

    if (colErr || !col) throw new NotFoundError('Collection not found.');

    // Prevent duplicate saves of the same catalogue item in the same collection
    const { data: existing } = await supabase
      .from('saved_items')
      .select('id')
      .eq('collection_id', body.collection_id)
      .eq('user_id', req.user!.id)
      .eq('catalogue_item_id', body.catalogue_item_id)
      .maybeSingle();

    if (existing) {
      res.status(200).json({ success: true, data: existing, already_saved: true });
      return;
    }

    const { data, error } = await supabase
      .from('saved_items')
      .insert({
        collection_id:       body.collection_id,
        user_id:             req.user!.id,
        tenant_id:           req.user!.tenant_id,
        catalogue_item_id:   body.catalogue_item_id,
        vendor_id:           body.vendor_id,
        vendor_name:         body.vendor_name,
        title:               body.title,
        description:         body.description ?? null,
        service_mode:        body.service_mode,
        origin_region:       body.origin_region,
        destination_region:  body.destination_region,
        transit_days_min:    body.transit_days_min ?? null,
        transit_days_max:    body.transit_days_max ?? null,
        base_price_amount:   body.base_price_amount ?? null,
        base_price_currency: body.base_price_currency,
        price_unit:          body.price_unit ?? null,
        tags:                body.tags ?? [],
        note:                body.note ?? null,
      })
      .select()
      .single();

    if (error) {
      log.error('[SAVES] Save item failed', { error: error.message });
      throw new AppError('Failed to save item.', 500);
    }

    res.status(201).json({ success: true, data });
  },
);

// ─── DELETE /api/v1/saves/items/:itemId ──────────────────────────────────────

router.delete(
  '/items/:itemId',
  validate(itemParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { error, count } = await supabase
      .from('saved_items')
      .delete({ count: 'exact' })
      .eq('id', req.params['itemId'])
      .eq('user_id', req.user!.id);

    if (error) {
      log.error('[SAVES] Delete item failed', { error: error.message });
      throw new AppError('Failed to remove item.', 500);
    }
    if (count === 0) throw new NotFoundError('Saved item not found.');

    res.status(200).json({ success: true, message: 'Item removed from collection.' });
  },
);

// ─── GET /api/v1/saves/collections/shared/:shareToken ────────────────────────
// Public endpoint — no auth required. Returns collection + items if is_shared=true.

router.get('/collections/shared/:shareToken', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const supabase = getAdminClient();
  const { shareToken } = req.params as { shareToken: string };

  const { data: col, error: colErr } = await supabase
    .from('saved_collections')
    .select('id, name, description, is_shared')
    .eq('share_token', shareToken)
    .eq('is_shared', true)
    .single();

  if (colErr || !col) {
    res.status(404).json({ success: false, error: { message: 'Collection not found or no longer shared.' } });
    return;
  }

  const { data: items, error: itemsErr } = await supabase
    .from('saved_items')
    .select('id, title, vendor_name, service_mode, origin_region, destination_region, transit_days_min, transit_days_max, base_price_amount, base_price_currency, tags, note')
    .eq('collection_id', col.id)
    .order('created_at', { ascending: false });

  if (itemsErr) {
    log.error('[SAVES] Shared collection items failed', { error: itemsErr.message });
    throw new AppError('Failed to load collection items.', 500);
  }

  res.status(200).json({ success: true, data: { ...col, items: items ?? [] } });
});

// ─── GET /api/v1/saves/check/:catalogueItemId ────────────────────────────────
// Returns the IDs of collections that contain this catalogue item.
// Used by the feed to show the bookmark filled/outline state per card.

router.get(
  '/check/:catalogueItemId',
  validate(catalogueParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('saved_items')
      .select('id, collection_id')
      .eq('user_id', req.user!.id)
      .eq('catalogue_item_id', req.params['catalogueItemId']);

    if (error) {
      log.error('[SAVES] Check item failed', { error: error.message });
      throw new AppError('Failed to check save status.', 500);
    }

    res.status(200).json({
      success: true,
      saved: (data ?? []).length > 0,
      saves: data ?? [],   // [ { id, collection_id }, ... ]
    });
  },
);

export { router as savesRouter };
