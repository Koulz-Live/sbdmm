/**
 * NotificationsDropdown — Bell icon with live unread count badge
 * and a dropdown panel listing recent notifications.
 *
 * Behaviour:
 * - Polls GET /api/v1/notifications/unread-count every 60 s while mounted
 * - Opens a dropdown that fetches the latest 10 notifications on first open
 * - "Mark all read" button fires PATCH /api/v1/notifications/read-all
 * - Clicking an individual notification fires PATCH /api/v1/notifications/:id/read
 * - Dropdown closes on outside-click or Escape key
 * - Accessible: aria-haspopup, aria-expanded, role="menu"
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import type { Notification } from '@sbdmm/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifItem = Pick<Notification, 'id' | 'type' | 'title' | 'body' | 'is_read' | 'created_at'>;

// ─── Notification type → icon ─────────────────────────────────────────────────
const TYPE_ICON: Record<string, string> = {
  order_status_changed: 'ph-package',
  quote_received:       'ph-chat-dots',
  quote_accepted:       'ph-check-circle',
  compliance_alert:     'ph-shield-warning',
  document_required:    'ph-file-text',
  mfa_required:         'ph-lock',
  system_alert:         'ph-bell',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationsDropdown(): React.JSX.Element {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Resolve current user id ──────────────────────────────────────────────────
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // ── Poll unread count ────────────────────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    const res = await api.get<{ unread_count: number }>('/api/v1/notifications/unread-count');
    if (res.success && res.data) setUnreadCount(res.data.unread_count);
  }, []);

  useEffect(() => {
    void refreshCount();
    const interval = setInterval(() => { void refreshCount(); }, 60_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // ── Supabase Realtime — push new notifications to badge + list ───────────────
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as NotifItem;
          setUnreadCount(c => c + 1);
          setItems(prev => [n, ...prev]);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  // ── Fetch items on first open ────────────────────────────────────────────────
  useEffect(() => {
    if (!open || fetched) return;
    setLoading(true);
    setError(null);
    void api.get<NotifItem[]>('/api/v1/notifications?page=1&per_page=10')
      .then((res) => {
        if (res.success && res.data) setItems(res.data);
        else setError('Could not load notifications.');
        setFetched(true);
      })
      .catch(() => setError('Could not load notifications.'))
      .finally(() => setLoading(false));
  }, [open, fetched]);

  // ── Close on outside click or Escape ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  // ── Mark single read ─────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    await api.patch(`/api/v1/notifications/${id}/read`, {});
  };

  // ── Mark all read ────────────────────────────────────────────────────────────
  const markAllRead = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    await api.patch('/api/v1/notifications/read-all', {});
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    setMarkingAll(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="position-relative"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 20, padding: '4px 6px', borderRadius: 6, lineHeight: 1 }}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <i className="ph ph-bell" />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute', top: 0, right: 0,
              width: 16, height: 16, borderRadius: '50%',
              background: '#dc2626', color: '#fff',
              fontSize: 10, fontWeight: 700, lineHeight: '16px',
              textAlign: 'center', pointerEvents: 'none',
              border: '2px solid #fff',
            }}
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 360, maxHeight: 460, overflowY: 'auto',
            background: '#fff', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(15,23,42,0.14)',
            border: '1px solid #e2e8f0', zIndex: 1050,
          }}
        >
          {/* Header */}
          <div className="d-flex align-items-center justify-content-between px-16 py-12" style={{ borderBottom: '1px solid #f1f5f9' }}>
            <span className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{ marginLeft: 8, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => { void markAllRead(); }}
                disabled={markingAll}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#299E60', fontSize: 12, fontWeight: 600, padding: 0 }}
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Body */}
          {loading ? (
            <div className="d-flex align-items-center justify-content-center py-4" style={{ color: '#94a3b8' }}>
              <span className="spinner-border spinner-border-sm me-2" role="status" />
              Loading…
            </div>
          ) : error ? (
            <div className="d-flex align-items-center gap-8 px-16 py-12" style={{ color: '#b91c1c', fontSize: 13 }}>
              <i className="ph ph-warning-circle" style={{ fontSize: 16 }} />
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-5" style={{ color: '#94a3b8' }}>
              <i className="ph ph-bell-slash" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
              <p className="mb-0 fw-semibold" style={{ fontSize: 13, color: '#64748b' }}>You're all caught up!</p>
              <p style={{ fontSize: 12 }}>No notifications yet.</p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} role="list">
              {items.map((n) => (
                <li
                  key={n.id}
                  role="menuitem"
                  onClick={() => { if (!n.is_read) void markRead(n.id); }}
                  style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    borderBottom: '1px solid #f8fafc',
                    background: n.is_read ? '#fff' : '#f0fdf4',
                    cursor: n.is_read ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: n.is_read ? '#f1f5f9' : '#dcfce7',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: n.is_read ? '#94a3b8' : '#299E60', fontSize: 16,
                    }}
                  >
                    <i className={`ph ${TYPE_ICON[n.type] ?? 'ph-bell'}`} />
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="d-flex align-items-start justify-content-between gap-4">
                      <span className="fw-semibold" style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.3 }}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#299E60', flexShrink: 0, marginTop: 4 }} />
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 4px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.body}
                    </p>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{relativeTime(n.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Footer */}
          {items.length > 0 && (
            <div className="text-center py-10" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#299E60', fontSize: 12, fontWeight: 600 }}
              >
                See all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
