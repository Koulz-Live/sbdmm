/**
 * OrdersPage — Order list with real-time status updates via Supabase Realtime.
 * Rebuilt using the MarketPro Bootstrap 5 template visual language.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useRealtimeOrders } from '../hooks/useRealtimeOrders';
import type { Order, PaginationMeta } from '@sbdmm/shared';

const PAGE_SIZE = 20;

const STATUS_META: Record<string, { bg: string; text: string; icon: string }> = {
  draft:         { bg: '#f9fafb', text: '#6b7280', icon: 'ph ph-pencil' },
  pending_quote: { bg: '#fffbeb', text: '#d97706', icon: 'ph ph-clock' },
  quoted:        { bg: '#eff6ff', text: '#2563eb', icon: 'ph ph-tag' },
  confirmed:     { bg: '#f0fdf4', text: '#15803d', icon: 'ph ph-check-circle' },
  in_transit:    { bg: '#ecfeff', text: '#0e7490', icon: 'ph ph-truck' },
  customs_hold:  { bg: '#fff7ed', text: '#c2410c', icon: 'ph ph-warning' },
  delivered:     { bg: '#f0fdf4', text: '#15803d', icon: 'ph ph-package-check' },
  disputed:      { bg: '#fef2f2', text: '#b91c1c', icon: 'ph ph-x-circle' },
  cancelled:     { bg: '#f9fafb', text: '#6b7280', icon: 'ph ph-x' },
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const m = STATUS_META[status] ?? { bg: '#f9fafb', text: '#6b7280', icon: 'ph ph-dot' };
  return (
    <span className="badge d-inline-flex align-items-center gap-4"
      style={{ background: m.bg, color: m.text, fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '4px 10px' }}>
      <i className={m.icon} style={{ fontSize: 12 }} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

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

  useEffect(() => { void fetchOrders(page); }, [fetchOrders, page]);

  useEffect(() => {
    if (realtimeEvents.length === 0) return;
    setOrders((prev) =>
      prev.map((o) => {
        const evt = realtimeEvents.find((e) => e.order.id === o.id && e.eventType === 'UPDATE');
        return evt ? evt.order : o;
      }),
    );
  }, [realtimeEvents]);

  const handleRefresh = (): void => {
    clearEvents();
    void fetchOrders(page);
  };

  return (
    <>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-24">
        <div>
          <div className="d-flex align-items-center gap-8">
            <span
              className="d-inline-flex align-items-center gap-6 px-12 py-4 rounded-pill"
              style={{ background: isConnected ? '#f0fdf4' : '#f8fafc', color: isConnected ? '#15803d' : '#94a3b8', fontSize: 12, fontWeight: 500 }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isConnected ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
              {isConnected ? 'Live updates active' : 'Connecting…'}
            </span>
            {realtimeEvents.length > 0 && (
              <span className="badge rounded-pill" style={{ background: '#eff6ff', color: '#2563eb', fontSize: 11 }}>
                {realtimeEvents.length} pending update{realtimeEvents.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="btn btn-sm d-flex align-items-center gap-6"
          style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500 }}
        >
          <i className="ph ph-arrows-clockwise" />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="alert alert-danger d-flex align-items-center gap-8 mb-20" style={{ borderRadius: 10, fontSize: 14 }}>
          <i className="ph ph-warning-circle" style={{ fontSize: 18 }} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div className="card-body p-0">
          {isLoading ? (
            <div className="d-flex align-items-center justify-content-center py-64" aria-live="polite" aria-busy="true">
              <div className="spinner-border" style={{ color: '#299E60' }} role="status">
                <span className="visually-hidden">Loading orders…</span>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="d-flex flex-column align-items-center justify-content-center py-64 text-center">
              <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16" style={{ width: 64, height: 64, background: '#f1f5f9' }}>
                <i className="ph ph-package" style={{ fontSize: 28, color: '#94a3b8' }} />
              </div>
              <p className="fw-semibold mb-4" style={{ color: '#374151' }}>No orders yet</p>
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Orders you create or receive will appear here.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <th className="fw-semibold py-12 px-24" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Reference</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Route</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Cargo</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Status</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} style={{ borderColor: '#f1f5f9' }}>
                      <td className="py-12 px-24">
                        <Link to={`/orders/${order.id}`} className="text-decoration-none fw-semibold" style={{ color: '#299E60', fontFamily: 'monospace', fontSize: 12 }}>
                          {order.reference_number}
                        </Link>
                      </td>
                      <td className="py-12 px-16" style={{ color: '#374151' }}>
                        <span className="d-flex align-items-center gap-6">
                          <i className="ph ph-map-pin" style={{ color: '#94a3b8', fontSize: 13 }} />
                          {order.origin_location}
                          <i className="ph ph-arrow-right" style={{ color: '#94a3b8', fontSize: 12 }} />
                          {order.destination_location}
                        </span>
                      </td>
                      <td className="py-12 px-16" style={{ color: '#374151' }}>{order.cargo_type}</td>
                      <td className="py-12 px-16"><StatusBadge status={order.status} /></td>
                      <td className="py-12 px-16" style={{ color: '#64748b' }}>{new Date(order.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination && !isLoading && orders.length > 0 && (
        <div className="d-flex align-items-center justify-content-between mt-16">
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total} orders
          </span>
          <div className="d-flex gap-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-sm d-flex align-items-center gap-4"
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#374151', borderRadius: 8, fontSize: 13, opacity: page === 1 ? 0.4 : 1 }}
            >
              <i className="ph ph-caret-left" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pagination.total_pages}
              className="btn btn-sm d-flex align-items-center gap-4"
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#374151', borderRadius: 8, fontSize: 13, opacity: page >= pagination.total_pages ? 0.4 : 1 }}
            >
              Next <i className="ph ph-caret-right" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
