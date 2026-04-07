/**
 * Notifications Route — User Inbox
 *
 * SECURITY PATTERNS:
 * 1. requireAuth on all routes — no anonymous access
 * 2. user_id and tenant_id always sourced from req.user — never from client
 * 3. IDOR: PATCH /:id verifies the notification belongs to req.user.id before update
 * 4. No mass assignment — only `is_read` is writable by the user
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ERROR_CODES } from '@sbdmm/shared';

const router = Router();

router.use(requireAuth);

// ─── List Notifications ───────────────────────────────────────────────────────
// GET /api/v1/notifications?page=1&per_page=20&unread_only=true
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });

  const page     = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
  const perPage  = Math.min(50, Math.max(1, parseInt((req.query['per_page'] as string) ?? '20', 10)));
  const unreadOnly = req.query['unread_only'] === 'true';
  const offset   = (page - 1) * perPage;

  const supabase = getAdminClient();

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user!.id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error, count } = await query;

  if (error) {
    log.error('[NOTIFICATIONS] List failed', { error: error.message });
    throw new AppError('Failed to retrieve notifications.', 500);
  }

  res.status(200).json({
    success: true,
    data: data ?? [],
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
      pagination: {
        page,
        per_page: perPage,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / perPage),
        unread_count: unreadOnly ? (count ?? 0) : undefined,
      },
    },
  });
});

// ─── Unread Count ─────────────────────────────────────────────────────────────
// GET /api/v1/notifications/unread-count — lightweight badge endpoint
router.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });

  const { count, error } = await getAdminClient()
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.user!.id)
    .eq('tenant_id', req.user!.tenant_id)
    .eq('is_read', false);

  if (error) {
    log.error('[NOTIFICATIONS] Unread count failed', { error: error.message });
    throw new AppError('Failed to retrieve unread count.', 500);
  }

  res.status(200).json({
    success: true,
    data: { unread_count: count ?? 0 },
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── Mark Single Notification as Read ────────────────────────────────────────
// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const { id } = req.params as { id: string };

  if (!/^[0-9a-f-]{36}$/.test(id)) {
    res.status(400).json({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid notification ID format.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return;
  }

  // SECURITY: Fetch first to verify ownership before update (IDOR prevention)
  const { data: existing, error: fetchError } = await getAdminClient()
    .from('notifications')
    .select('id, user_id, tenant_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) throw new NotFoundError('Notification');

  // Verify ownership — user can only mark their own notifications
  if ((existing.user_id as string) !== req.user!.id || (existing.tenant_id as string) !== req.user!.tenant_id) {
    log.warn('[NOTIFICATIONS] Ownership mismatch on mark-read', { user_id: req.user!.id, notification_id: id });
    throw new NotFoundError('Notification');
  }

  const { data: updated, error: updateError } = await getAdminClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    log.error('[NOTIFICATIONS] Mark-read failed', { error: updateError.message });
    throw new AppError('Failed to mark notification as read.', 500);
  }

  res.status(200).json({
    success: true,
    data: updated,
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── Mark All as Read ─────────────────────────────────────────────────────────
// PATCH /api/v1/notifications/read-all
router.patch('/read-all', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });

  const { error, count } = await getAdminClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', req.user!.id)
    .eq('tenant_id', req.user!.tenant_id)
    .eq('is_read', false);

  if (error) {
    log.error('[NOTIFICATIONS] Mark-all-read failed', { error: error.message });
    throw new AppError('Failed to mark notifications as read.', 500);
  }

  res.status(200).json({
    success: true,
    data: { updated: count ?? 0 },
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

export { router as notificationsRouter };
