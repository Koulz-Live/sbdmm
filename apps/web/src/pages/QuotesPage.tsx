/**
 * QuotesPage — Freight Quote Management
 *
 * ROLE SPLIT:
 *  - logistics_provider: sees their own submitted quotes, can submit new quotes for orders
 *  - buyer / vendor / tenant_admin: sees quotes on their orders, can accept/reject
 *  - super_admin: cross-tenant read-only via admin route (not this page)
 *
 * SECURITY:
 * - All writes are idempotency-keyed to prevent double-submits on flaky connections
 * - Valid-until date is enforced server-side; we display expiry clearly
 * - Price/currency fields are validated before submit
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import type { Quote, QuoteStatus, PaginationMeta } from '@sbdmm/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

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

const STATUS_COLORS: Record<QuoteStatus, string> = {
  pending:   '#d97706',
  accepted:  '#16a34a',
  rejected:  '#dc2626',
  expired:   '#6b7280',
  withdrawn: '#9ca3af',
};

function StatusBadge({ status }: { status: QuoteStatus }): React.JSX.Element {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
      textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ─── Submit Quote Form ────────────────────────────────────────────────────────

interface SubmitFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function SubmitQuoteForm({ onSuccess, onCancel }: SubmitFormProps): React.JSX.Element {
  const [form, setForm] = useState<SubmitQuoteForm>({
    order_id: '',
    price_amount: '',
    price_currency: 'USD',
    transit_days_estimated: '',
    valid_until: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Partial<SubmitQuoteForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    const res = await api.post<Quote>(
      '/api/v1/quotes',
      {
        order_id: form.order_id.trim(),
        price_amount: parseFloat(form.price_amount),
        price_currency: form.price_currency,
        transit_days_estimated: parseInt(form.transit_days_estimated, 10),
        valid_until: new Date(form.valid_until).toISOString(),
        notes: form.notes.trim() || undefined,
      },
      idempotencyKey,
    );

    setSubmitting(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(onSuccess, 1800);
    } else {
      setSubmitError(res.error?.message ?? 'Failed to submit quote.');
    }
  }

  if (success) {
    return <div style={{ color: '#16a34a', fontWeight: 600, padding: '10px 0' }}>✓ Quote submitted successfully. Refreshing…</div>;
  }

  const field = (label: string, key: keyof SubmitQuoteForm, input: React.ReactNode): React.JSX.Element => (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {input}
      {errors[key] && <p style={{ color: '#dc2626', fontSize: 12, margin: '3px 0 0' }}>{errors[key]}</p>}
    </div>
  );

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' };

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      {submitError && (
        <div role="alert" style={{ gridColumn: '1 / -1', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
          {submitError}
        </div>
      )}

      {field('Order ID *', 'order_id',
        <input type="text" value={form.order_id} onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}
          placeholder="UUID of the order you are quoting" style={inputStyle} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
        {field('Price Amount *', 'price_amount',
          <input type="number" min="0.01" step="0.01" value={form.price_amount} onChange={e => setForm(f => ({ ...f, price_amount: e.target.value }))}
            placeholder="e.g. 4800.00" style={inputStyle} />
        )}
        {field('Currency *', 'price_currency',
          <select value={form.price_currency} onChange={e => setForm(f => ({ ...f, price_currency: e.target.value }))} style={inputStyle}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {field('Transit Days *', 'transit_days_estimated',
        <input type="number" min="1" step="1" value={form.transit_days_estimated} onChange={e => setForm(f => ({ ...f, transit_days_estimated: e.target.value }))}
          placeholder="Estimated days in transit" style={inputStyle} />
      )}

      {field('Valid Until *', 'valid_until',
        <input type="datetime-local" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} style={inputStyle} />
      )}

      <div style={{ gridColumn: '1 / -1' }}>
        {field('Notes', 'notes',
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3} placeholder="Optional notes for the buyer…" style={{ ...inputStyle, resize: 'vertical' }} />
        )}
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem' }}>
        <button type="submit" disabled={submitting}
          style={{ padding: '9px 20px', background: submitting ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {submitting ? 'Submitting…' : 'Submit Quote'}
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '9px 20px', background: '#f1f5f9', color: '#374151', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}>
          Cancel
        </button>
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

  // Accept / reject state
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
      } else {
        setError(res.error?.message ?? 'Failed to load quotes.');
      }
    } catch {
      setError('Unable to load quotes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQuotes(page);
  }, [fetchQuotes, page]);

  async function handleAction(quoteId: string, act: 'accept' | 'reject'): Promise<void> {
    setActioning(true);
    setError(null);
    try {
      const res = await api.patch<Quote>(`/api/v1/quotes/${quoteId}/${act}`, {});
      if (res.success) {
        setQuotes(qs => qs.map(q => q.id === quoteId
          ? { ...q, status: act === 'accept' ? 'accepted' : 'rejected' }
          : q,
        ));
        setActionQuoteId(null);
        setAction(null);
      } else {
        setError(res.error?.message ?? `Failed to ${act} quote.`);
      }
    } catch {
      setError(`Unable to ${act} quote. Please try again.`);
    } finally {
      setActioning(false);
    }
  }

  function openAction(quoteId: string, act: 'accept' | 'reject'): void {
    setActionQuoteId(quoteId);
    setAction(act);
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Quotes</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            {isProvider
              ? 'Submit and track freight quotes for open orders.'
              : 'Review and action quotes submitted by logistics providers.'}
          </p>
        </div>
        {isProvider && (
          <button
            onClick={() => setShowForm(s => !s)}
            style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            {showForm ? '✕ Close' : '+ Submit Quote'}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: '1rem', fontSize: 14 }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Submit form panel */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: 16 }}>Submit New Quote</h2>
          <SubmitQuoteForm
            onSuccess={() => { setShowForm(false); void fetchQuotes(1); setPage(1); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Quotes table */}
      {loading ? (
        <div aria-busy="true" style={{ color: '#6b7280', padding: '2rem', textAlign: 'center' }}>Loading quotes…</div>
      ) : quotes.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '1px dashed #e2e8f0', borderRadius: 8 }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No quotes found.</p>
          {isProvider && <p style={{ fontSize: 14 }}>Click "Submit Quote" to respond to an open order.</p>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Order', 'Price', 'Transit', 'Valid Until', 'Status', 'Submitted', ...(canBuyerAction ? ['Actions'] : [])].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map(q => {
                const isExpired = new Date(q.valid_until) < new Date();
                return (
                  <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      {q.order_title ?? q.order_id.slice(0, 8) + '…'}
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, fontFamily: 'monospace' }}>{q.id.slice(0, 12)}…</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      {formatCurrency(q.price_amount, q.price_currency)}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{q.transit_days_estimated}d</td>
                    <td style={{ padding: '10px 12px', color: isExpired ? '#dc2626' : '#374151', fontWeight: isExpired ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {new Date(q.valid_until).toLocaleDateString()}
                      {isExpired && <div style={{ fontSize: 11 }}>Expired</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}><StatusBadge status={q.status} /></td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(q.created_at).toLocaleDateString()}
                    </td>
                    {canBuyerAction && (
                      <td style={{ padding: '10px 12px' }}>
                        {q.status === 'pending' && !isExpired ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => openAction(q.id, 'accept')}
                              style={{ padding: '4px 10px', fontSize: 12, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 4, cursor: 'pointer' }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => openAction(q.id, 'reject')}
                              style={{ padding: '4px 10px', fontSize: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
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

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: 13, color: '#6b7280' }}>
          <span>
            Showing {((pagination.page - 1) * pagination.per_page) + 1}–{Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => p - 1)} disabled={page <= 1}
              style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #e2e8f0', cursor: page <= 1 ? 'not-allowed' : 'pointer', background: page <= 1 ? '#f8fafc' : '#fff', color: page <= 1 ? '#9ca3af' : '#374151' }}>
              ← Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.total_pages}
              style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #e2e8f0', cursor: page >= pagination.total_pages ? 'not-allowed' : 'pointer', background: page >= pagination.total_pages ? '#f8fafc' : '#fff', color: page >= pagination.total_pages ? '#9ca3af' : '#374151' }}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Accept / Reject confirmation modal */}
      {actionQuoteId && action && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} role="dialog" aria-modal="true">
          <div style={{ background: '#fff', borderRadius: 10, padding: '2rem', width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: 18, textTransform: 'capitalize' }}>{action} Quote?</h3>
            <p style={{ margin: '0 0 1.25rem', color: '#374151', fontSize: 14 }}>
              {action === 'accept'
                ? 'Accepting this quote will notify the provider and move the order to confirmed status.'
                : 'Rejecting this quote will notify the provider. This cannot be undone.'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setActionQuoteId(null); setAction(null); }} disabled={actioning}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => { void handleAction(actionQuoteId, action); }}
                disabled={actioning}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: action === 'accept' ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 600, cursor: actioning ? 'not-allowed' : 'pointer' }}
              >
                {actioning ? (action === 'accept' ? 'Accepting…' : 'Rejecting…') : (action === 'accept' ? 'Accept' : 'Reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
