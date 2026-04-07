/**
 * QuotesPage — Freight Quote Management
 *
 * ROLE SPLIT:
 *  - logistics_provider: sees their own submitted quotes, can submit new quotes
 *  - buyer / vendor / tenant_admin: sees quotes on their orders, can accept/reject
 *  - super_admin: cross-tenant read-only via admin route (not this page)
 *
 * SECURITY:
 * - All writes are idempotency-keyed to prevent double-submits
 * - Valid-until date is enforced server-side; we display expiry clearly
 * - Price/currency fields are validated before submit
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import type { Quote, QuoteStatus, PaginationMeta, Order } from '@sbdmm/shared';

interface QuoteRow extends Quote {
  order_title?: string;
  provider_name?: string;
}

interface SubmitQuoteForm {
  order_id: string;
  price_amount: string;
  price_currency: string;
  transit_days_estimated: string;
  valid_until: string;
  notes: string;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'CNY', 'AED', 'SGD'];

interface StatusMeta { bg: string; text: string; border: string; icon: string }
const STATUS_META: Record<QuoteStatus, StatusMeta> = {
  pending:   { bg: '#fffbeb', text: '#b45309', border: '#fde68a', icon: 'ph-clock' },
  accepted:  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', icon: 'ph-check-circle' },
  rejected:  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', icon: 'ph-x-circle' },
  expired:   { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0', icon: 'ph-timer' },
  withdrawn: { bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0', icon: 'ph-arrow-u-up-left' },
};

function QuoteStatusBadge({ status }: { status: QuoteStatus }): React.JSX.Element {
  const m = STATUS_META[status] ?? { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0', icon: 'ph-question' };
  return (
    <span className="d-inline-flex align-items-center gap-4"
      style={{ background: m.bg, color: m.text, border: `1px solid ${m.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
      <i className={`ph ${m.icon}`} style={{ fontSize: 13 }} />
      {status}
    </span>
  );
}

function formatCurrency(amount: number, currency: string): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

// ─── Submit Quote Form ────────────────────────────────────────────────────────

interface OpenOrder {
  id: string;
  reference_number: string;
  origin_location: string;
  destination_location: string;
  cargo_type: string;
}

interface SubmitFormProps { onSuccess: () => void; onCancel: () => void; }

function SubmitQuoteForm({ onSuccess, onCancel }: SubmitFormProps): React.JSX.Element {
  const [form, setForm] = useState<SubmitQuoteForm>({
    order_id: '', price_amount: '', price_currency: 'USD',
    transit_days_estimated: '', valid_until: '', notes: '',
  });
  const [errors, setErrors] = useState<Partial<SubmitQuoteForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch open orders that can be quoted on
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoadingOrders(true);
      // Fetch up to 100 orders — providers see all tenant orders in pending_quote/draft status
      const res = await api.get<{ data: Order[] }>('/api/v1/orders?page=1&per_page=100');
      if (cancelled) return;
      if (res.success && res.data) {
        const pending = (res.data.data ?? []).filter(
          o => o.status === 'pending_quote' || o.status === 'draft' || o.status === 'quoted'
        );
        setOpenOrders(pending.map(o => ({
          id: o.id,
          reference_number: o.reference_number,
          origin_location: o.origin_location,
          destination_location: o.destination_location,
          cargo_type: o.cargo_type,
        })));
      }
      setLoadingOrders(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  function validate(): boolean {
    const e: Partial<SubmitQuoteForm> = {};
    if (!form.order_id.trim()) e.order_id = 'Order ID is required.';
    const amount = parseFloat(form.price_amount);
    if (isNaN(amount) || amount <= 0) e.price_amount = 'Enter a positive price.';
    const days = parseInt(form.transit_days_estimated, 10);
    if (isNaN(days) || days < 1) e.transit_days_estimated = 'Enter a valid number of transit days (≥ 1).';
    if (!form.valid_until) e.valid_until = 'Expiry date is required.';
    else if (new Date(form.valid_until) <= new Date()) e.valid_until = 'Expiry date must be in the future.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    const idempotencyKey = `quote-${form.order_id}-${Date.now()}`;
    const res = await api.post<Quote>('/api/v1/quotes', {
      order_id: form.order_id.trim(),
      price_amount: parseFloat(form.price_amount),
      price_currency: form.price_currency,
      transit_days_estimated: parseInt(form.transit_days_estimated, 10),
      valid_until: new Date(form.valid_until).toISOString(),
      notes: form.notes.trim() || undefined,
    }, idempotencyKey);
    setSubmitting(false);
    if (res.success) { setSuccess(true); setTimeout(onSuccess, 1800); }
    else setSubmitError(res.error?.message ?? 'Failed to submit quote.');
  }

  const inputCls = "form-control";
  const inputStyle = { borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' };

  if (success) return (
    <div className="d-flex align-items-center gap-8" style={{ color: '#15803d', fontWeight: 600 }}>
      <i className="ph ph-check-circle" style={{ fontSize: 20 }} />
      Quote submitted successfully. Refreshing…
    </div>
  );

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }}>
      {submitError && (
        <div role="alert" className="mb-3"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
          <i className="ph ph-warning-circle me-2" />{submitError}
        </div>
      )}
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Order <span style={{ color: '#dc2626' }}>*</span></label>
          {loadingOrders ? (
            <div className="d-flex align-items-center gap-8" style={{ color: '#64748b', fontSize: 13 }}>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              Loading available orders…
            </div>
          ) : openOrders.length === 0 ? (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#64748b' }}>
              <i className="ph ph-info me-2" />
              No open orders available to quote at this time. Check back later.
            </div>
          ) : (
            <select
              className="form-select"
              style={{ borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' }}
              value={form.order_id}
              onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}
            >
              <option value="">— Select an order —</option>
              {openOrders.map(o => (
                <option key={o.id} value={o.id}>
                  {o.reference_number} · {o.origin_location} → {o.destination_location} ({o.cargo_type})
                </option>
              ))}
            </select>
          )}
          {errors.order_id && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 3 }}>{errors.order_id}</div>}
        </div>

        <div className="col-md-8">
          <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Price <span style={{ color: '#dc2626' }}>*</span></label>
          <input type="number" className={inputCls} style={inputStyle} min="0.01" step="0.01" value={form.price_amount}
            onChange={e => setForm(f => ({ ...f, price_amount: e.target.value }))} placeholder="e.g. 4800.00" />
          {errors.price_amount && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 3 }}>{errors.price_amount}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Currency <span style={{ color: '#dc2626' }}>*</span></label>
          <select className="form-select" style={inputStyle} value={form.price_currency}
            onChange={e => setForm(f => ({ ...f, price_currency: e.target.value }))}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="col-md-6">
          <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Transit Days <span style={{ color: '#dc2626' }}>*</span></label>
          <input type="number" className={inputCls} style={inputStyle} min="1" step="1" value={form.transit_days_estimated}
            onChange={e => setForm(f => ({ ...f, transit_days_estimated: e.target.value }))} placeholder="Estimated days in transit" />
          {errors.transit_days_estimated && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 3 }}>{errors.transit_days_estimated}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Valid Until <span style={{ color: '#dc2626' }}>*</span></label>
          <input type="datetime-local" className={inputCls} style={inputStyle} value={form.valid_until}
            onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
          {errors.valid_until && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 3 }}>{errors.valid_until}</div>}
        </div>

        <div className="col-12">
          <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Notes <span className="fw-normal" style={{ color: '#94a3b8' }}>(optional)</span></label>
          <textarea className={inputCls} style={{ ...inputStyle, resize: 'vertical' } as React.CSSProperties} rows={3} value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes for the buyer…" />
        </div>

        <div className="col-12 d-flex gap-8">
          <button type="submit" disabled={submitting}
            className="btn d-flex align-items-center gap-8"
            style={{ background: submitting ? '#93c5fd' : '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}>
            {submitting
              ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Submitting…</>
              : <><i className="ph ph-paper-plane-tilt" /> Submit Quote</>}
          </button>
          <button type="button" onClick={onCancel}
            className="btn"
            style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 20px', fontWeight: 500, fontSize: 14 }}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuotesPage(): React.JSX.Element {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [actionQuoteId, setActionQuoteId] = useState<string | null>(null);
  const [action, setAction] = useState<'accept' | 'reject' | null>(null);
  const [actioning, setActioning] = useState(false);

  const isProvider = user?.role === 'logistics_provider';
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'super_admin';
  const canBuyerAction = user?.role === 'buyer' || isAdmin;

  const fetchQuotes = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<QuoteRow[]>(`/api/v1/quotes?page=${p}&per_page=20`);
      if (res.success && res.data) {
        setQuotes(res.data);
        if (res.meta?.pagination) setPagination(res.meta.pagination);
      } else setError(res.error?.message ?? 'Failed to load quotes.');
    } catch { setError('Unable to load quotes. Please try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchQuotes(page); }, [fetchQuotes, page]);

  async function handleAction(quoteId: string, act: 'accept' | 'reject'): Promise<void> {
    setActioning(true);
    setError(null);
    try {
      const res = await api.patch<Quote>(`/api/v1/quotes/${quoteId}/${act}`, {});
      if (res.success) {
        setQuotes(qs => qs.map(q => q.id === quoteId ? { ...q, status: act === 'accept' ? 'accepted' : 'rejected' } : q));
        setActionQuoteId(null);
        setAction(null);
      } else setError(res.error?.message ?? `Failed to ${act} quote.`);
    } catch { setError(`Unable to ${act} quote. Please try again.`); }
    finally { setActioning(false); }
  }

  return (
    <div className="p-4" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4">
        <div>
          <h1 className="fw-bold mb-1" style={{ fontSize: 22, color: '#0f172a' }}>Quotes</h1>
          <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
            {isProvider
              ? 'Submit and track freight quotes for open orders.'
              : 'Review and action quotes submitted by logistics providers.'}
          </p>
        </div>
        {isProvider && (
          <button onClick={() => setShowForm(s => !s)}
            className="btn d-flex align-items-center gap-8"
            style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>
            <i className={`ph ${showForm ? 'ph-x' : 'ph-plus'}`} style={{ fontSize: 16 }} />
            {showForm ? 'Close' : 'Submit Quote'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="d-flex align-items-center justify-content-between mb-3" role="alert"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
          <span><i className="ph ph-warning-circle me-2" />{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Submit form */}
      {showForm && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body p-4">
            <h5 className="fw-semibold mb-3" style={{ color: '#0f172a', fontSize: 16 }}>
              <i className="ph ph-paper-plane-tilt me-2" style={{ color: '#299E60' }} />
              Submit New Quote
            </h5>
            <SubmitQuoteForm
              onSuccess={() => { setShowForm(false); void fetchQuotes(1); setPage(1); }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {/* Quotes table */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="d-flex align-items-center justify-content-center p-5" style={{ color: '#64748b' }}>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Loading quotes…
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-5" style={{ color: '#94a3b8' }}>
              <i className="ph ph-chat-dots" style={{ fontSize: 40, display: 'block', marginBottom: 12 }} />
              <p className="fw-semibold mb-1" style={{ color: '#64748b' }}>No quotes found.</p>
              {isProvider && <p style={{ fontSize: 13 }}>Click "Submit Quote" to respond to an open order.</p>}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Order', 'Price', 'Transit', 'Valid Until', 'Status', 'Submitted', ...(canBuyerAction ? ['Actions'] : [])].map(h => (
                      <th key={h} className="fw-semibold border-bottom"
                        style={{ padding: '12px 16px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quotes.map(q => {
                    const isExpired = new Date(q.valid_until) < new Date();
                    return (
                      <tr key={q.id}>
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                          <div className="fw-semibold" style={{ color: '#0f172a', fontSize: 13 }}>
                            {q.order_title ?? `Order ${q.order_id.slice(0, 8)}…`}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{q.id.slice(0, 12)}…</div>
                        </td>
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontWeight: 700, color: '#0f172a' }}>
                          {formatCurrency(q.price_amount, q.price_currency)}
                        </td>
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#475569' }}>
                          <i className="ph ph-truck me-1" style={{ color: '#64748b' }} />{q.transit_days_estimated}d
                        </td>
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ color: isExpired ? '#b91c1c' : '#374151', fontWeight: isExpired ? 600 : 400 }}>
                            {new Date(q.valid_until).toLocaleDateString()}
                          </span>
                          {isExpired && <div style={{ fontSize: 11, color: '#b91c1c' }}>Expired</div>}
                        </td>
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                          <QuoteStatusBadge status={q.status} />
                        </td>
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(q.created_at).toLocaleDateString()}
                        </td>
                        {canBuyerAction && (
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            {q.status === 'pending' && !isExpired ? (
                              <div className="d-flex gap-6">
                                <button onClick={() => { setActionQuoteId(q.id); setAction('accept'); }}
                                  className="btn btn-sm d-flex align-items-center gap-4"
                                  style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px' }}>
                                  <i className="ph ph-check" /> Accept
                                </button>
                                <button onClick={() => { setActionQuoteId(q.id); setAction('reject'); }}
                                  className="btn btn-sm d-flex align-items-center gap-4"
                                  style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px' }}>
                                  <i className="ph ph-x" /> Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="d-flex justify-content-between align-items-center mt-3" style={{ fontSize: 13, color: '#64748b' }}>
          <span>Showing {((pagination.page - 1) * pagination.per_page) + 1}–{Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total}</span>
          <div className="d-flex gap-8">
            <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="btn btn-sm"
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page <= 1 ? '#f8fafc' : '#fff', color: page <= 1 ? '#94a3b8' : '#374151' }}>
              <i className="ph ph-caret-left me-1" /> Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.total_pages} className="btn btn-sm"
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page >= pagination.total_pages ? '#f8fafc' : '#fff', color: page >= pagination.total_pages ? '#94a3b8' : '#374151' }}>
              Next <i className="ph ph-caret-right ms-1" />
            </button>
          </div>
        </div>
      )}

      {/* Accept / Reject confirmation modal */}
      {actionQuoteId && action && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="card border-0 shadow" style={{ borderRadius: 14, width: 400, maxWidth: '90vw' }}>
            <div className="card-body p-4">
              <div className="d-flex align-items-center gap-12 mb-3">
                <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{ width: 44, height: 44, background: action === 'accept' ? '#f0fdf4' : '#fef2f2' }}>
                  <i className={`ph ${action === 'accept' ? 'ph-check-circle' : 'ph-x-circle'}`}
                    style={{ fontSize: 20, color: action === 'accept' ? '#15803d' : '#b91c1c' }} />
                </div>
                <h5 className="mb-0 fw-bold" style={{ fontSize: 17, textTransform: 'capitalize' }}>{action} Quote?</h5>
              </div>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                {action === 'accept'
                  ? 'Accepting this quote will notify the provider and move the order to confirmed status.'
                  : 'Rejecting this quote will notify the provider. This cannot be undone.'}
              </p>
              <div className="d-flex justify-content-end gap-8 mt-3">
                <button onClick={() => { setActionQuoteId(null); setAction(null); }} disabled={actioning}
                  className="btn" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 18px', background: '#f8fafc', color: '#374151', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={() => { void handleAction(actionQuoteId, action); }} disabled={actioning}
                  className="btn d-flex align-items-center gap-6"
                  style={{ background: action === 'accept' ? '#15803d' : '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
                  {actioning
                    ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> {action === 'accept' ? 'Accepting…' : 'Rejecting…'}</>
                    : <>{action === 'accept' ? 'Accept' : 'Reject'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
