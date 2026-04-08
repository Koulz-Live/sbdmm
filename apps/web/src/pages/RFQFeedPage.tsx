/**
 * RfqFeedPage — Provider-specific RFQ (Request for Quote) feed.
 *
 * Shows all open orders (status: pending_quote | draft | quoted) that
 * the authenticated vendor/logistics_provider can bid on.
 * Each row has an inline "Submit Quote" action that pre-fills the order.
 *
 * Route: /rfqs — accessible to vendor | logistics_provider only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/apiClient';
import type { Order, Quote, PaginationMeta } from '@sbdmm/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'CNY', 'AED', 'SGD'];

interface QuoteForm {
  price_amount: string;
  price_currency: string;
  transit_days_estimated: string;
  valid_until: string;
  notes: string;
}

const BLANK_FORM: QuoteForm = {
  price_amount: '',
  price_currency: 'USD',
  transit_days_estimated: '',
  valid_until: '',
  notes: '',
};

const STATUS_META: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  draft:         { bg: '#f8fafc', text: '#64748b', icon: 'ph-pencil-simple', label: 'Draft' },
  pending_quote: { bg: '#fffbeb', text: '#b45309', icon: 'ph-clock', label: 'Open RFQ' },
  quoted:        { bg: '#eff6ff', text: '#1d4ed8', icon: 'ph-chat-dots', label: 'Quoted' },
};

// ─── Inline Quote Row Form ────────────────────────────────────────────────────

interface InlineQuoteFormProps {
  orderId: string;
  onSuccess: (orderId: string) => void;
  onCancel: () => void;
}

function InlineQuoteForm({ orderId, onSuccess, onCancel }: InlineQuoteFormProps): React.JSX.Element {
  const [form, setForm] = useState<QuoteForm>(BLANK_FORM);
  const [errors, setErrors] = useState<Partial<QuoteForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function validate(): boolean {
    const e: Partial<QuoteForm> = {};
    const amount = parseFloat(form.price_amount);
    if (isNaN(amount) || amount <= 0) e.price_amount = 'Enter a positive price.';
    const days = parseInt(form.transit_days_estimated, 10);
    if (isNaN(days) || days < 1) e.transit_days_estimated = 'Enter at least 1 day.';
    if (!form.valid_until) e.valid_until = 'Expiry date is required.';
    else if (new Date(form.valid_until) <= new Date()) e.valid_until = 'Must be in the future.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    const idempotencyKey = `quote-${orderId}-${Date.now()}`;
    const res = await api.post<Quote>('/api/v1/quotes', {
      order_id: orderId,
      price_amount: parseFloat(form.price_amount),
      price_currency: form.price_currency,
      transit_days_estimated: parseInt(form.transit_days_estimated, 10),
      valid_until: new Date(form.valid_until).toISOString(),
      notes: form.notes.trim() || undefined,
    }, idempotencyKey);
    setSubmitting(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => onSuccess(orderId), 1400);
    } else {
      setSubmitError(res.error?.message ?? 'Failed to submit quote.');
    }
  }

  const inputStyle: React.CSSProperties = { borderRadius: 6, fontSize: 13, borderColor: '#cbd5e1', padding: '6px 10px' };
  const errTxt = (k: keyof QuoteForm): React.ReactNode =>
    errors[k] ? <div style={{ color: '#b91c1c', fontSize: 11, marginTop: 2 }}>{errors[k]}</div> : null;

  if (success) {
    return (
      <div className="d-flex align-items-center gap-8 p-16" style={{ background: '#f0fdf4', borderRadius: 8, color: '#15803d', fontWeight: 600, fontSize: 13 }}>
        <i className="ph ph-check-circle" style={{ fontSize: 18 }} />
        Quote submitted! This order will be marked as quoted.
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }}
      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginTop: 8 }}>
      <div className="fw-semibold mb-12" style={{ fontSize: 13, color: '#0f172a' }}>
        <i className="ph ph-paper-plane-tilt me-2" style={{ color: '#299E60' }} />
        Submit Your Quote
      </div>

      {submitError && (
        <div className="mb-12 d-flex align-items-center gap-6"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
          <i className="ph ph-warning-circle" />{submitError}
        </div>
      )}

      <div className="row g-12">
        <div className="col-md-3">
          <label className="form-label fw-semibold mb-4" style={{ fontSize: 12 }}>
            Price <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="number" className="form-control" style={inputStyle}
            min="0.01" step="0.01"
            value={form.price_amount}
            onChange={e => setForm(f => ({ ...f, price_amount: e.target.value }))}
            placeholder="e.g. 4800.00"
          />
          {errTxt('price_amount')}
        </div>

        <div className="col-md-2">
          <label className="form-label fw-semibold mb-4" style={{ fontSize: 12 }}>
            Currency <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select className="form-select" style={inputStyle}
            value={form.price_currency}
            onChange={e => setForm(f => ({ ...f, price_currency: e.target.value }))}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="col-md-2">
          <label className="form-label fw-semibold mb-4" style={{ fontSize: 12 }}>
            Transit Days <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="number" className="form-control" style={inputStyle}
            min="1" step="1"
            value={form.transit_days_estimated}
            onChange={e => setForm(f => ({ ...f, transit_days_estimated: e.target.value }))}
            placeholder="e.g. 14"
          />
          {errTxt('transit_days_estimated')}
        </div>

        <div className="col-md-3">
          <label className="form-label fw-semibold mb-4" style={{ fontSize: 12 }}>
            Valid Until <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="datetime-local" className="form-control" style={inputStyle}
            value={form.valid_until}
            onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
          />
          {errTxt('valid_until')}
        </div>

        <div className="col-md-2 d-flex align-items-end gap-6">
          <button
            type="submit" disabled={submitting}
            className="btn btn-sm d-flex align-items-center gap-6"
            style={{
              background: submitting ? '#86efac' : '#299E60',
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '7px 16px', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
            }}>
            {submitting
              ? <><span className="spinner-border spinner-border-sm" role="status" /> Sending…</>
              : <><i className="ph ph-paper-plane-tilt" /> Send</>}
          </button>
          <button type="button" onClick={onCancel}
            className="btn btn-sm"
            style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 12px', fontSize: 13 }}>
            ✕
          </button>
        </div>

        <div className="col-12">
          <label className="form-label fw-semibold mb-4" style={{ fontSize: 12 }}>
            Notes <span className="fw-normal" style={{ color: '#94a3b8' }}>(optional)</span>
          </label>
          <input
            type="text" className="form-control" style={inputStyle}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Service details, special conditions…"
            maxLength={500}
          />
        </div>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RfqFeedPage(): React.JSX.Element {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_quote' | 'quoted'>('pending_quote');

  const fetchOrders = useCallback(async (p: number, status: string): Promise<void> => {
    setLoading(true);
    setError(null);
    const statusParam = status === 'all' ? '' : `&status=${status}`;
    const res = await api.get<{ data: Order[] }>(
      `/api/v1/orders?page=${p}&per_page=20${statusParam}`
    );
    if (res.success && res.data) {
      const orders = (res.data.data ?? []).filter(
        o => o.status === 'pending_quote' || o.status === 'draft' || o.status === 'quoted'
      );
      setOrders(orders);
      if (res.meta?.pagination) setPagination(res.meta.pagination);
    } else {
      setError(res.error?.message ?? 'Failed to load orders.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchOrders(page, statusFilter);
  }, [fetchOrders, page, statusFilter]);

  const handleQuoteSuccess = (orderId: string): void => {
    setSubmittedIds(s => new Set([...s, orderId]));
    setExpandedId(null);
    // Update order status optimistically
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'quoted' as const } : o));
  };

  const filteredOrders = statusFilter === 'all'
    ? orders
    : statusFilter === 'pending_quote'
      ? orders.filter(o => o.status === 'pending_quote' || o.status === 'draft')
      : orders.filter(o => o.status === 'quoted');

  return (
    <div style={{ maxWidth: 1000 }}>

      {/* Page header */}
      <div className="d-flex align-items-start justify-content-between mb-24 flex-wrap gap-12">
        <div>
          <h1 className="fw-bold mb-4" style={{ fontSize: 22, color: '#0f172a' }}>
            <i className="ph ph-list-magnifying-glass me-10" style={{ color: '#299E60' }} />
            Open RFQs
          </h1>
          <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
            Browse open requests for quotation and submit your competitive bids.
          </p>
        </div>
        <button
          onClick={() => void fetchOrders(page, statusFilter)}
          className="btn btn-sm d-flex align-items-center gap-6"
          style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
          <i className="ph ph-arrows-clockwise" />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="d-flex gap-0 mb-20" style={{ borderBottom: '2px solid #e2e8f0' }}>
        {([
          { key: 'pending_quote', label: 'Open for Quotes', icon: 'ph-clock' },
          { key: 'quoted',        label: 'Already Quoted', icon: 'ph-chat-dots' },
          { key: 'all',           label: 'All Orders',     icon: 'ph-list' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
            className="btn d-flex align-items-center gap-6"
            style={{
              background: 'none', border: 'none',
              borderBottom: statusFilter === tab.key ? '2px solid #299E60' : '2px solid transparent',
              marginBottom: -2, borderRadius: 0,
              padding: '10px 18px',
              color: statusFilter === tab.key ? '#299E60' : '#64748b',
              fontWeight: statusFilter === tab.key ? 700 : 500,
              fontSize: 13,
            }}>
            <i className={`ph ${tab.icon}`} style={{ fontSize: 15 }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="d-flex align-items-center gap-8 mb-20"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
          <i className="ph ph-warning-circle" />{error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#b91c1c', marginLeft: 'auto', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="d-flex align-items-center justify-content-center py-64" style={{ color: '#64748b' }}>
          <span className="spinner-border me-2" style={{ color: '#299E60' }} role="status" />
          Loading open RFQs…
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body text-center py-64">
            <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16"
              style={{ width: 72, height: 72, background: '#f1f5f9' }}>
              <i className="ph ph-list-magnifying-glass" style={{ fontSize: 32, color: '#94a3b8' }} />
            </div>
            <p className="fw-semibold mb-4" style={{ fontSize: 16, color: '#374151' }}>
              {statusFilter === 'pending_quote' ? 'No open RFQs right now' : 'No orders found'}
            </p>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>
              {statusFilter === 'pending_quote'
                ? 'New requests will appear here as buyers post shipment orders.'
                : 'Try switching to a different filter.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-12">
          {filteredOrders.map(order => {
            const isExpanded = expandedId === order.id;
            const alreadyQuoted = submittedIds.has(order.id) || order.status === 'quoted';
            const meta = STATUS_META[order.status] ?? { bg: '#fffbeb', text: '#b45309', icon: 'ph-clock', label: 'Open RFQ' };

            return (
              <div
                key={order.id}
                className="card border-0 shadow-sm"
                style={{
                  borderRadius: 12,
                  border: isExpanded ? '1.5px solid #299E60' : '1px solid transparent',
                  transition: 'border 0.15s',
                }}
              >
                <div className="card-body p-20">
                  {/* Order summary row */}
                  <div className="d-flex align-items-start gap-16 flex-wrap">
                    {/* Status dot */}
                    <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                      style={{ width: 42, height: 42, background: meta.bg, marginTop: 2 }}>
                      <i className={`ph ${meta.icon}`} style={{ fontSize: 20, color: meta.text }} />
                    </div>

                    {/* Main info */}
                    <div className="flex-grow-1" style={{ minWidth: 200 }}>
                      <div className="d-flex align-items-center gap-10 flex-wrap mb-4">
                        <span className="fw-bold" style={{ fontFamily: 'monospace', fontSize: 13, color: '#0f172a' }}>
                          {order.reference_number}
                        </span>
                        <span style={{
                          background: meta.bg, color: meta.text,
                          borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                        }}>
                          {meta.label}
                        </span>
                        {alreadyQuoted && !submittedIds.has(order.id) && (
                          <span style={{
                            background: '#eff6ff', color: '#2563eb',
                            borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                          }}>
                            <i className="ph ph-check me-4" />You've quoted
                          </span>
                        )}
                        {submittedIds.has(order.id) && (
                          <span style={{
                            background: '#f0fdf4', color: '#15803d',
                            borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                          }}>
                            <i className="ph ph-check-circle me-4" />Quote sent!
                          </span>
                        )}
                      </div>

                      <div className="d-flex align-items-center gap-16 flex-wrap" style={{ fontSize: 13, color: '#374151' }}>
                        <span className="d-flex align-items-center gap-6">
                          <i className="ph ph-map-pin" style={{ color: '#299E60', fontSize: 14 }} />
                          {order.origin_location}
                          <i className="ph ph-arrow-right" style={{ color: '#94a3b8', fontSize: 12 }} />
                          {order.destination_location}
                        </span>
                        <span className="d-flex align-items-center gap-6" style={{ color: '#64748b' }}>
                          <i className="ph ph-package" style={{ fontSize: 14 }} />
                          {order.cargo_type}
                        </span>
                        {order.estimated_weight_kg && (
                          <span className="d-flex align-items-center gap-6" style={{ color: '#64748b' }}>
                            <i className="ph ph-scales" style={{ fontSize: 14 }} />
                            {order.estimated_weight_kg.toLocaleString()} kg
                          </span>
                        )}
                        {order.requested_delivery_date && (
                          <span className="d-flex align-items-center gap-6" style={{ color: '#64748b' }}>
                            <i className="ph ph-calendar" style={{ fontSize: 14 }} />
                            Required by {new Date(order.requested_delivery_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>

                      {order.special_requirements && (
                        <div className="mt-8" style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                          <i className="ph ph-info me-4" />
                          {order.special_requirements.length > 120
                            ? order.special_requirements.slice(0, 120) + '…'
                            : order.special_requirements}
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="d-flex align-items-center gap-8 flex-shrink-0">
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      {!alreadyQuoted ? (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          className="btn btn-sm d-flex align-items-center gap-6"
                          style={{
                            background: isExpanded ? '#f1f5f9' : '#299E60',
                            color: isExpanded ? '#374151' : '#fff',
                            border: isExpanded ? '1px solid #cbd5e1' : 'none',
                            borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13,
                          }}>
                          <i className={`ph ${isExpanded ? 'ph-x' : 'ph-paper-plane-tilt'}`} />
                          {isExpanded ? 'Cancel' : 'Submit Quote'}
                        </button>
                      ) : (
                        <span style={{
                          background: '#f0fdf4', color: '#15803d',
                          border: '1px solid #bbf7d0', borderRadius: 8,
                          padding: '8px 14px', fontSize: 12, fontWeight: 600,
                        }}>
                          <i className="ph ph-check-circle me-4" />Quoted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Inline quote form */}
                  {isExpanded && !alreadyQuoted && (
                    <InlineQuoteForm
                      orderId={order.id}
                      onSuccess={handleQuoteSuccess}
                      onCancel={() => setExpandedId(null)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && !loading && (
        <div className="d-flex align-items-center justify-content-between mt-20" style={{ fontSize: 13, color: '#64748b' }}>
          <span>
            Page {page} of {pagination.total_pages} · {pagination.total} orders total
          </span>
          <div className="d-flex gap-8">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-sm"
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page <= 1 ? '#f8fafc' : '#fff', color: page <= 1 ? '#94a3b8' : '#374151' }}>
              <i className="ph ph-caret-left me-1" /> Prev
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= pagination.total_pages}
              className="btn btn-sm"
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page >= pagination.total_pages ? '#f8fafc' : '#fff', color: page >= pagination.total_pages ? '#94a3b8' : '#374151' }}>
              Next <i className="ph ph-caret-right ms-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
