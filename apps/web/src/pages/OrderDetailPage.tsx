/**
 * OrderDetailPage — Full detail view for a single logistics order.
 *
 * Fetches GET /api/v1/orders/:id and renders all order fields
 * with a timeline, quotes summary, and status update control
 * (for tenant_admin / logistics_provider).
 *
 * Accessible from /orders/:id — replaces the previous OrdersPage fallback.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import type { Order, OrderStatus, Quote } from '@sbdmm/shared';

// ─── Status meta ──────────────────────────────────────────────────────────────

interface StatusMeta { bg: string; text: string; icon: string; label: string }
const ORDER_STATUS_META: Record<string, StatusMeta> = {
  draft:            { bg: '#f8fafc', text: '#64748b', icon: 'ph-pencil-simple', label: 'Draft' },
  pending_quote:    { bg: '#fffbeb', text: '#b45309', icon: 'ph-clock', label: 'Pending Quote' },
  quoted:           { bg: '#eff6ff', text: '#1d4ed8', icon: 'ph-chat-dots', label: 'Quoted' },
  confirmed:        { bg: '#f0fdf4', text: '#15803d', icon: 'ph-check-circle', label: 'Confirmed' },
  in_transit:       { bg: '#f0f9ff', text: '#0369a1', icon: 'ph-truck', label: 'In Transit' },
  customs_hold:     { bg: '#fff7ed', text: '#c2410c', icon: 'ph-warning', label: 'Customs Hold' },
  delivered:        { bg: '#f0fdf4', text: '#166534', icon: 'ph-package-check', label: 'Delivered' },
  disputed:         { bg: '#fef9c3', text: '#854d0e', icon: 'ph-scales', label: 'Disputed' },
  cancelled:        { bg: '#fef2f2', text: '#b91c1c', icon: 'ph-x-circle', label: 'Cancelled' },
};

function OrderStatusBadge({ status }: { status: string }): React.JSX.Element {
  const m = ORDER_STATUS_META[status] ?? { bg: '#f1f5f9', text: '#64748b', icon: 'ph-question', label: status };
  return (
    <span className="d-inline-flex align-items-center gap-6"
      style={{ background: m.bg, color: m.text, border: `1px solid ${m.text}33`, borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
      <i className={`ph ${m.icon}`} style={{ fontSize: 14 }} />
      {m.label}
    </span>
  );
}

// ─── Detail field row ─────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 16 }}>
      <dt style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</dt>
      <dd style={{ fontSize: 14, color: '#0f172a', margin: 0 }}>{value ?? <span style={{ color: '#cbd5e1' }}>—</span>}</dd>
    </div>
  );
}

// ─── Allowed next statuses (role-gated) ──────────────────────────────────────
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft:         ['pending_quote', 'cancelled'],
  pending_quote: ['cancelled'],
  quoted:        ['confirmed', 'cancelled'],
  confirmed:     ['in_transit', 'cancelled'],
  in_transit:    ['delivered', 'customs_hold', 'disputed'],
  customs_hold:  ['in_transit', 'cancelled'],
  delivered:     [],
  disputed:      ['confirmed', 'cancelled'],
  cancelled:     [],
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrderDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status update state
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');
  const [statusNotes, setStatusNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canUpdateStatus =
    profile?.role === 'tenant_admin' ||
    profile?.role === 'super_admin' ||
    profile?.role === 'logistics_provider';

  const fetchOrder = useCallback(async (): Promise<void> => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [orderRes, quotesRes] = await Promise.all([
        api.get<Order>(`/api/v1/orders/${id}`),
        api.get<Quote[]>(`/api/v1/quotes?order_id=${id}&per_page=50`),
      ]);
      if (orderRes.success && orderRes.data) {
        setOrder(orderRes.data);
        setNewStatus('');
      } else {
        setError(orderRes.error?.message ?? 'Order not found.');
      }
      if (quotesRes.success && quotesRes.data) setQuotes(quotesRes.data);
    } catch {
      setError('Failed to load order details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchOrder(); }, [fetchOrder]);

  const handleStatusUpdate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newStatus || !order) return;
    setUpdatingStatus(true);
    setStatusMsg(null);
    try {
      const res = await api.patch<Order>(`/api/v1/orders/${order.id}/status`, {
        status: newStatus,
        notes: statusNotes.trim() || undefined,
      });
      if (res.success && res.data) {
        setOrder(res.data);
        setStatusMsg({ type: 'success', text: `Status updated to "${ORDER_STATUS_META[newStatus]?.label ?? newStatus}".` });
        setNewStatus('');
        setStatusNotes('');
      } else {
        setStatusMsg({ type: 'error', text: res.error?.message ?? 'Update failed.' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Update failed. Please try again.' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 320, color: '#64748b' }}>
        <span className="spinner-border spinner-border-sm me-2" role="status" />
        Loading order…
      </div>
    );
  }

  // ── Error / Not found ────────────────────────────────────────────────────────
  if (error || !order) {
    return (
      <div className="p-4" style={{ maxWidth: 640 }}>
        <div className="card border-0 shadow-sm text-center py-5" style={{ borderRadius: 12 }}>
          <i className="ph ph-package-x" style={{ fontSize: 48, color: '#e2e8f0', display: 'block', marginBottom: 16 }} />
          <h2 className="fw-bold mb-8" style={{ fontSize: 18, color: '#0f172a' }}>Order not found</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>{error ?? "This order doesn't exist or you don't have permission to view it."}</p>
          <button
            onClick={() => navigate('/orders')}
            className="btn mx-auto d-inline-flex align-items-center gap-8"
            style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}
          >
            <i className="ph ph-arrow-left" /> Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const nextStatuses = NEXT_STATUSES[order.status] ?? [];

  return (
    <div className="p-4" style={{ maxWidth: 900 }}>

      {/* Back navigation */}
      <div className="mb-20">
        <Link
          to="/orders"
          className="d-inline-flex align-items-center gap-6"
          style={{ fontSize: 14, color: '#64748b', textDecoration: 'none', fontWeight: 500 }}
        >
          <i className="ph ph-arrow-left" />
          All Orders
        </Link>
      </div>

      {/* Page header */}
      <div className="d-flex align-items-start justify-content-between gap-16 mb-4 flex-wrap">
        <div>
          <div className="d-flex align-items-center gap-12 mb-4">
            <h1 className="fw-bold mb-0" style={{ fontSize: 22, color: '#0f172a' }}>
              {order.reference_number}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Created {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            &nbsp;· Last updated {new Date(order.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <button
          onClick={() => { void fetchOrder(); }}
          className="btn d-flex align-items-center gap-8"
          style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 16px', fontWeight: 500, fontSize: 13 }}
        >
          <i className="ph ph-arrows-clockwise" /> Refresh
        </button>
      </div>

      <div className="row g-4">

        {/* ── Left column: order fields ── */}
        <div className="col-lg-7">

          {/* Route card */}
          <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-20" style={{ fontSize: 15, color: '#0f172a' }}>
                <i className="ph ph-map-pin me-2" style={{ color: '#299E60' }} />
                Shipment Route
              </h5>
              <div className="d-flex align-items-start gap-16 flex-wrap">
                <div className="flex-grow-1" style={{ minWidth: 140 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Origin</p>
                  <p className="fw-semibold mb-0" style={{ fontSize: 15, color: '#0f172a' }}>
                    <i className="ph ph-dot-outline me-1" style={{ color: '#299E60' }} />
                    {order.origin_location}
                  </p>
                </div>
                <div className="d-flex align-items-center" style={{ padding: '16px 0', color: '#cbd5e1' }}>
                  <i className="ph ph-arrow-right" style={{ fontSize: 18 }} />
                </div>
                <div className="flex-grow-1" style={{ minWidth: 140 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Destination</p>
                  <p className="fw-semibold mb-0" style={{ fontSize: 15, color: '#0f172a' }}>
                    <i className="ph ph-map-pin me-1" style={{ color: '#dc2626' }} />
                    {order.destination_location}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cargo details */}
          <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-16" style={{ fontSize: 15, color: '#0f172a' }}>
                <i className="ph ph-package me-2" style={{ color: '#299E60' }} />
                Cargo Details
              </h5>
              <dl className="mb-0">
                <div className="row">
                  <div className="col-sm-6"><Field label="Cargo Type" value={order.cargo_type} /></div>
                  <div className="col-sm-6"><Field label="Est. Weight" value={order.estimated_weight_kg != null ? `${order.estimated_weight_kg.toLocaleString()} kg` : null} /></div>
                  <div className="col-sm-6"><Field label="Est. Volume" value={order.estimated_volume_cbm != null ? `${order.estimated_volume_cbm} m³` : null} /></div>
                  <div className="col-sm-6">
                    <Field
                      label="Required Delivery"
                      value={order.requested_delivery_date
                        ? new Date(order.requested_delivery_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : null}
                    />
                  </div>
                  {order.special_requirements && (
                    <div className="col-12">
                      <Field label="Special Requirements" value={<span style={{ whiteSpace: 'pre-wrap' }}>{order.special_requirements}</span>} />
                    </div>
                  )}
                </div>
              </dl>
            </div>
          </div>

          {/* Quotes on this order */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-16" style={{ fontSize: 15, color: '#0f172a' }}>
                <i className="ph ph-chat-dots me-2" style={{ color: '#299E60' }} />
                Quotes ({quotes.length})
              </h5>
              {quotes.length === 0 ? (
                <div className="text-center py-4" style={{ color: '#94a3b8' }}>
                  <i className="ph ph-chat-slash" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                  <p className="mb-0" style={{ fontSize: 13 }}>No quotes received yet.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm mb-0" style={{ fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                        <th style={{ fontWeight: 600, padding: '8px 12px', border: 'none' }}>Vendor</th>
                        <th style={{ fontWeight: 600, padding: '8px 12px', border: 'none' }}>Price</th>
                        <th style={{ fontWeight: 600, padding: '8px 12px', border: 'none' }}>Transit</th>
                        <th style={{ fontWeight: 600, padding: '8px 12px', border: 'none' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((q) => (
                        <tr key={q.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 500 }}>
                            {q.vendor_id.slice(0, 8)}…
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                            {q.price_amount.toLocaleString('en-US', { style: 'currency', currency: q.price_currency ?? 'USD' })}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {q.transit_days_estimated != null ? `${q.transit_days_estimated}d` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              background: q.status === 'accepted' ? '#f0fdf4' : q.status === 'rejected' ? '#fef2f2' : '#f8fafc',
                              color: q.status === 'accepted' ? '#15803d' : q.status === 'rejected' ? '#b91c1c' : '#64748b',
                              borderRadius: 12, padding: '2px 9px', fontSize: 11, fontWeight: 600,
                            }}>
                              {q.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column: status update + meta ── */}
        <div className="col-lg-5">

          {/* Status update panel */}
          {canUpdateStatus && nextStatuses.length > 0 && (
            <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-16" style={{ fontSize: 15, color: '#0f172a' }}>
                  <i className="ph ph-arrows-clockwise me-2" style={{ color: '#299E60' }} />
                  Update Status
                </h5>

                {statusMsg && (
                  <div
                    role="alert"
                    className="d-flex align-items-center gap-8 mb-16"
                    style={{
                      background: statusMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                      color: statusMsg.type === 'success' ? '#15803d' : '#b91c1c',
                      border: `1px solid ${statusMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                      borderRadius: 8, padding: '10px 14px', fontSize: 13,
                    }}
                  >
                    <i className={`ph ${statusMsg.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'}`} />
                    {statusMsg.text}
                  </div>
                )}

                <form onSubmit={(e) => { void handleStatusUpdate(e); }}>
                  <div className="mb-16">
                    <label className="form-label fw-semibold" style={{ fontSize: 13, color: '#374151' }}>
                      New Status <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value as OrderStatus)}
                      required
                      style={{ borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' }}
                    >
                      <option value="">— Select new status —</option>
                      {nextStatuses.map(s => (
                        <option key={s} value={s}>{ORDER_STATUS_META[s]?.label ?? s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-16">
                    <label className="form-label fw-semibold" style={{ fontSize: 13, color: '#374151' }}>
                      Notes <span className="fw-normal" style={{ color: '#94a3b8' }}>(optional)</span>
                    </label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={statusNotes}
                      onChange={e => setStatusNotes(e.target.value)}
                      placeholder="Add context for this status change…"
                      style={{ borderRadius: 8, fontSize: 13, borderColor: '#cbd5e1', resize: 'vertical' }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={updatingStatus || !newStatus}
                    className="btn w-100 d-flex align-items-center justify-content-center gap-8"
                    style={{
                      background: (updatingStatus || !newStatus) ? '#86efac' : '#299E60',
                      color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 0', fontWeight: 600, fontSize: 14,
                    }}
                  >
                    {updatingStatus
                      ? <><span className="spinner-border spinner-border-sm" role="status" /> Updating…</>
                      : <><i className="ph ph-check" /> Confirm Update</>
                    }
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Order metadata */}
          <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-16" style={{ fontSize: 15, color: '#0f172a' }}>
                <i className="ph ph-info me-2" style={{ color: '#299E60' }} />
                Order Info
              </h5>
              <dl className="mb-0">
                <Field label="Order ID" value={<span style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.id}</span>} />
                <Field label="Reference" value={order.reference_number} />
                <Field label="Status" value={<OrderStatusBadge status={order.status} />} />
                <Field
                  label="Created"
                  value={new Date(order.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                />
                <Field
                  label="Last Updated"
                  value={new Date(order.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                />
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
