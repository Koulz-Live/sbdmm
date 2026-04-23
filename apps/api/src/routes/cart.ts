/**
 * Cart Route — E-Commerce Shopping Cart & Checkout
 *
 * ENDPOINTS:
 *
 *   Cart CRUD:
 *     GET    /api/v1/cart              → list authenticated user's cart items
 *     POST   /api/v1/cart              → add item (upserts: increments qty if already in cart)
 *     PATCH  /api/v1/cart/:id          → update quantity of a cart item
 *     DELETE /api/v1/cart/:id          → remove one cart item
 *     DELETE /api/v1/cart              → clear entire cart
 *
 *   Coupon:
 *     POST   /api/v1/cart/coupon/validate → validate a coupon code, return discount_pct
 *
 *   Checkout:
 *     POST   /api/v1/cart/checkout     → place order: snapshot cart → checkout_orders → clear cart
 *
 *   Order History:
 *     GET    /api/v1/cart/orders       → list user's past checkout orders
 *
 * SECURITY:
 *   - All routes require auth; user_id + tenant_id always injected server-side.
 *   - Named sub-routes (coupon/validate, checkout, orders) are declared BEFORE
 *     the /:id param route to prevent shadowing.
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

const addItemSchema = z.object({
  catalogue_item_id:   z.string().uuid('Invalid catalogue item ID'),
  vendor_id:           z.string().uuid('Invalid vendor ID'),
  vendor_name:         z.string().min(1).max(200).trim(),
  title:               z.string().min(1).max(200).trim(),
  base_price_amount:   z.number().nonnegative().nullable().optional(),
  base_price_currency: z.string().length(3).optional().default('USD'),
  price_unit:          z.string().max(50).trim().optional().nullable(),
  service_mode:        z.string().min(1).max(20).trim().optional().default('OTHER'),
  origin_region:       z.string().max(100).trim().optional().default(''),
  destination_region:  z.string().max(100).trim().optional().default(''),
});

const updateQtySchema = z.object({
  quantity: z.number().int().min(1).max(100),
});

const couponValidateSchema = z.object({
  code: z.string().min(1).max(50).trim(),
});

const checkoutSchema = z.object({
  coupon_code: z.string().min(1).max(50).trim().optional(),
});

const cartItemParamsSchema = z.object({ id: uuidSchema });

// ─── GET /api/v1/cart — List cart items ──────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', req.user!.id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: true });

  if (error) {
    log.error('[CART] Failed to fetch cart', { error: error.message });
    throw new AppError('Failed to load cart.', 500);
  }

  res.status(200).json({
    success: true,
    data: data ?? [],
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── POST /api/v1/cart/coupon/validate ───────────────────────────────────────
// MUST be declared before /:id to avoid shadowing

router.post(
  '/coupon/validate',
  validate(couponValidateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const code = (req.body as { code: string }).code.toUpperCase();

    const { data: coupon, error } = await supabase
      .from('coupon_codes')
      .select('id, code, discount_pct, is_active, max_uses, use_count, expires_at')
      .eq('code', code)
      .single();

    if (error || !coupon) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_COUPON', message: 'Coupon code not found.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    if (!coupon.is_active) {
      res.status(400).json({
        success: false,
        error: { code: 'COUPON_INACTIVE', message: 'This coupon is no longer active.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      res.status(400).json({
        success: false,
        error: { code: 'COUPON_EXPIRED', message: 'This coupon has expired.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    if (coupon.max_uses !== null && coupon.use_count >= coupon.max_uses) {
      res.status(400).json({
        success: false,
        error: { code: 'COUPON_EXHAUSTED', message: 'This coupon has reached its usage limit.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    log.info('[CART/COUPON] Coupon validated', { code, discount_pct: coupon.discount_pct });

    res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        discount_pct: Number(coupon.discount_pct),
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/cart/checkout ───────────────────────────────────────────────

router.post(
  '/checkout',
  validate(checkoutSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { coupon_code } = req.body as { coupon_code?: string };

    // 1. Load current cart
    const { data: cartItems, error: cartErr } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('tenant_id', req.user!.tenant_id);

    if (cartErr) throw new AppError('Failed to read cart.', 500);

    if (!cartItems || cartItems.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'EMPTY_CART', message: 'Your cart is empty.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // 2. Validate coupon (if provided)
    let discountPct = 0;
    if (coupon_code) {
      const code = coupon_code.toUpperCase();
      const { data: coupon } = await supabase
        .from('coupon_codes')
        .select('discount_pct, is_active, max_uses, use_count, expires_at')
        .eq('code', code)
        .eq('is_active', true)
        .single();

      if (coupon) {
        const notExpired = !coupon.expires_at || new Date(coupon.expires_at) >= new Date();
        const notExhausted = coupon.max_uses === null || coupon.use_count < coupon.max_uses;
        if (notExpired && notExhausted) {
          discountPct = Number(coupon.discount_pct);
          // Increment use_count
          await supabase
            .from('coupon_codes')
            .update({ use_count: coupon.use_count + 1 })
            .eq('code', code);
        }
      }
    }

    // 3. Calculate totals (null price items count as 0 in totals)
    const subtotal = cartItems.reduce(
      (sum, item) => sum + Number(item.base_price_amount ?? 0) * item.quantity,
      0,
    );
    const discountAmount = Math.round((subtotal * discountPct / 100) * 100) / 100;
    const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

    // Determine currency from first item (all items in same cart should be same currency)
    const currency = (cartItems[0]?.base_price_currency as string) ?? 'USD';

    // 4. Build order items snapshot (denormalised for immutability)
    const orderItems = cartItems.map(item => ({
      catalogue_item_id:  item.catalogue_item_id,
      vendor_id:          item.vendor_id,
      vendor_name:        item.vendor_name,
      title:              item.title,
      service_mode:       item.service_mode,
      origin_region:      item.origin_region,
      destination_region: item.destination_region,
      quantity:           item.quantity,
      unit_price:         item.base_price_amount ?? 0,
      line_total:         Number(item.base_price_amount ?? 0) * item.quantity,
      currency:           item.base_price_currency,
      price_unit:         item.price_unit ?? 'per shipment',
    }));

    // 5. Insert checkout_order
    const { data: order, error: orderErr } = await supabase
      .from('checkout_orders')
      .insert({
        user_id:         req.user!.id,
        tenant_id:       req.user!.tenant_id,
        items:           orderItems,
        subtotal,
        discount_pct:    discountPct,
        discount_amount: discountAmount,
        total,
        coupon_code:     coupon_code?.toUpperCase() ?? null,
        // Auto-mark as paid when total is 0 (full discount or all-free items)
        status:          total === 0 ? 'paid' : 'pending',
        currency,
      })
      .select()
      .single();

    if (orderErr || !order) {
      log.error('[CART/CHECKOUT] Failed to create order', { error: orderErr?.message });
      throw new AppError('Failed to place order.', 500);
    }

    // 6. Clear the cart
    await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', req.user!.id)
      .eq('tenant_id', req.user!.tenant_id);

    log.info('[CART/CHECKOUT] Order placed', {
      order_id: order.id,
      total,
      item_count: cartItems.length,
      coupon: coupon_code ?? null,
    });

    res.status(201).json({
      success: true,
      data: order,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/cart/orders — Order history ─────────────────────────────────

router.get('/orders', async (req: Request, res: Response): Promise<void> => {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('checkout_orders')
    .select('*')
    .eq('user_id', req.user!.id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new AppError('Failed to load order history.', 500);

  res.status(200).json({
    success: true,
    data: data ?? [],
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── POST /api/v1/cart — Add item ─────────────────────────────────────────────

router.post(
  '/',
  validate(addItemSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const body = req.body as z.infer<typeof addItemSchema>;

    // Check if already in cart (same catalogue_item_id for this user)
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', req.user!.id)
      .eq('catalogue_item_id', body.catalogue_item_id)
      .single();

    if (existing) {
      // Increment quantity (max 100)
      const newQty = Math.min((existing.quantity as number) + 1, 100);
      const { data, error } = await supabase
        .from('cart_items')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new AppError('Failed to update cart.', 500);

      log.info('[CART] Item qty incremented', { cart_item_id: existing.id, new_qty: newQty });
      res.status(200).json({
        success: true,
        data,
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Insert new cart item
    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        user_id:             req.user!.id,
        tenant_id:           req.user!.tenant_id,
        catalogue_item_id:   body.catalogue_item_id,
        vendor_id:           body.vendor_id,
        vendor_name:         body.vendor_name,
        title:               body.title,
        base_price_amount:   body.base_price_amount ?? null,
        base_price_currency: body.base_price_currency ?? 'USD',
        price_unit:          body.price_unit ?? null,
        service_mode:        body.service_mode ?? 'OTHER',
        origin_region:       body.origin_region ?? '',
        destination_region:  body.destination_region ?? '',
        quantity:            1,
      })
      .select()
      .single();

    if (error) {
      log.error('[CART] Failed to add item', { error: error.message });
      throw new AppError('Failed to add item to cart.', 500);
    }

    log.info('[CART] Item added', { cart_item_id: data.id });
    res.status(201).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── PATCH /api/v1/cart/:id — Update quantity ─────────────────────────────────

router.patch(
  '/:id',
  validate(cartItemParamsSchema, 'params'),
  validate(updateQtySchema),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getAdminClient();
    const { id } = req.params as { id: string };
    const { quantity } = req.body as { quantity: number };

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', req.user!.id)   // IDOR protection
      .select()
      .single();

    if (error || !data) {
      throw new NotFoundError('Cart item not found.');
    }

    res.status(200).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── DELETE /api/v1/cart/:id — Remove one item ────────────────────────────────

router.delete(
  '/:id',
  validate(cartItemParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getAdminClient();
    const { id } = req.params as { id: string };

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user!.id);   // IDOR protection

    if (error) throw new AppError('Failed to remove cart item.', 500);

    res.status(200).json({
      success: true,
      data: null,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── DELETE /api/v1/cart — Clear entire cart ─────────────────────────────────

router.delete('/', async (req: Request, res: Response): Promise<void> => {
  const supabase = getAdminClient();

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', req.user!.id)
    .eq('tenant_id', req.user!.tenant_id);

  if (error) throw new AppError('Failed to clear cart.', 500);

  res.status(200).json({
    success: true,
    data: null,
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

export { router as cartRouter };
