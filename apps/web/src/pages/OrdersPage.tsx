/**
 * OrdersPage — Order list with real-time status updates via Supabase Realtime.
 *
 * Live UPDATE events are merged into the displayed rows so buyers/admins
 * see status changes (e.g. in_transit → delivered) without a full page refresh.
 * A banner appears when unprocessed realtime events are buffered; "Refresh"
 * re-fetches from the API and clears the buffer.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useRealtimeOrders } from '../hooks/useRealtimeOrders';
import type { Order, PaginationMeta } from '@sbdmm/shared';

const PAGE_SIZE = 20;

export default function OrdersPage(): React.JSX.Element {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { realtimeEvents, isConnected, clearEvents } = useRealtimeOrders();

  const fetchOrders = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const result = await api.get<{ data: Order[]; total: number }>(
      `/api/v1/orders?page=${p}&per_page=${PAGE_SIZE}`,
    );
    if (result.success && result.data) {
      setOrders(result.data.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else {
      setError(result.error?.message ?? 'Failed to load orders.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchOrders(page);
  }, [fetchOrders, page]);

  // Merge UPDATE events into local state so status changes render live
  useEffect(() => {
    if (realtimeEvents.length === 0) return;
    setOrders((prev) =>
      prev.map((o) => {
        const evt = realtimeEvents.find(
          (e) => e.order.id === o.id && e.eventType === 'UPDATE',
        );
        return evt ? evt.order : o;
      }),
    );
  }, [realtimeEvents]);

  const handleRefresh = (): void => {
    clearEvents();
    void fetchOrders(page);
  };

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Orders</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            {isConnected ? '🟢 Live updates active' : '⚪ Connecting to live updates…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {realtimeEvents.length > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', padding: '2px var(--space-2)', background: '#dbeafe', color: '#1d4ed8', borderRadius: 'var(--radius-full)' }}>
              {realtimeEvents.length} live update{realtimeEvents.length !== 1 ? 's' : ''}
            </span>
          )}
          <OButton onClick={handleRefresh}>Refresh</OButton>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingState label="Loading orders…" />
      ) : orders.length === 0 ? (
        <EmptyState label="No orders found." />
      ) : (
        <>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <Th>Reference</Th>
                  <Th>Origin → Destination</Th>
                  <Th>Cargo</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td>
                      <Link
                        to={`/orders/${order.id}`}
                        style={{ color: 'var(--color-primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                      >
                        {order.reference_number}
                      </Link>
                    </Td>
                    <Td>{order.origin_location} → {order.destination_location}</Td>
                    <Td>{order.cargo_type}</Td>
                    <Td><StatusBadge status={order.status} /></Td>
                    <Td>{new Date(order.created_at).toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              <span>
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total}
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <OButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</OButton>
                <OButton onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}>Next →</OButton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return (
    <div role="alert" style={{ padding: 'var(--space-4)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', marginBottom: 'var(--space-6)' }}>
      {message}
    </div>
  );
}

function LoadingState({ label }: { label: string }): React.JSX.Element {
  return <div aria-live="polite" aria-busy="true" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>{label}</div>;
}

function EmptyState({ label }: { label: string }): React.JSX.Element {
  return <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>{label}</div>;
}

function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{children}</td>;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  pending_quote: '#f59e0b',
  quoted: '#3b82f6',
  confirmed: '#6366f1',
  in_transit: '#06b6d4',
  customs_hold: '#f97316',
  delivered: '#16a34a',
  disputed: '#ef4444',
  cancelled: '#6b7280',
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 500, background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
