/**
 * OrdersPage — Order list with real-time status updates via Supabase Realtime.
 * Rebuilt using the MarketPro Bootstrap 5 template visual language.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useRealtimeOrders } from '../hooks/useRealtimeOrders';
import type { Order, PaginationMeta } from '@sbdmm/shared';

const PAGE_SIZE = 20;

// ISO 3166-1 alpha-2 common codes for the dropdown
const COUNTRY_CODES = [
  ['US','United States'],['GB','United Kingdom'],['DE','Germany'],['FR','France'],
  ['CN','China'],['JP','Japan'],['IN','India'],['AU','Australia'],['CA','Canada'],
  ['ZA','South Africa'],['AE','United Arab Emirates'],['SG','Singapore'],
  ['NL','Netherlands'],['BE','Belgium'],['IT','Italy'],['ES','Spain'],
  ['BR','Brazil'],['MX','Mexico'],['KR','South Korea'],['SA','Saudi Arabia'],
  ['NG','Nigeria'],['KE','Kenya'],['EG','Egypt'],['PK','Pakistan'],['BD','Bangladesh'],
  ['TH','Thailand'],['VN','Vietnam'],['MY','Malaysia'],['ID','Indonesia'],['PH','Philippines'],
];

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

// ─── Create Order Modal ───────────────────────────────────────────────────────

interface CreateOrderForm {
  title: string;
  origin_address: string;
  origin_country: string;
  destination_address: string;
  destination_country: string;
  cargo_description: string;
  cargo_weight_kg: string;
  cargo_volume_m3: string;
  required_delivery_date: string;
  special_instructions: string;
}

const BLANK_ORDER: CreateOrderForm = {
  title: '', origin_address: '', origin_country: '',
  destination_address: '', destination_country: '',
  cargo_description: '', cargo_weight_kg: '',
  cargo_volume_m3: '', required_delivery_date: '', special_instructions: '',
};

interface CreateOrderModalProps {
  onSuccess: (newOrder: Order) => void;
  onClose: () => void;
}

function CreateOrderModal({ onSuccess, onClose }: CreateOrderModalProps): React.JSX.Element {
  const [form, setForm] = useState<CreateOrderForm>(BLANK_ORDER);
  const [errors, setErrors] = useState<Partial<CreateOrderForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (field: keyof CreateOrderForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  function validate(): boolean {
    const e: Partial<CreateOrderForm> = {};
    if (!form.title.trim())               e.title               = 'Title is required.';
    if (!form.origin_address.trim())      e.origin_address      = 'Origin address is required.';
    if (!form.origin_country)             e.origin_country      = 'Origin country is required.';
    if (!form.destination_address.trim()) e.destination_address = 'Destination address is required.';
    if (!form.destination_country)        e.destination_country = 'Destination country is required.';
    if (!form.cargo_description.trim())   e.cargo_description   = 'Cargo description is required.';
    const kg = parseFloat(form.cargo_weight_kg);
    if (isNaN(kg) || kg <= 0)             e.cargo_weight_kg     = 'Enter a positive weight.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      origin_address: form.origin_address.trim(),
      origin_country: form.origin_country,
      destination_address: form.destination_address.trim(),
      destination_country: form.destination_country,
      cargo_description: form.cargo_description.trim(),
      cargo_weight_kg: parseFloat(form.cargo_weight_kg),
    };
    if (form.cargo_volume_m3) body['cargo_volume_m3'] = parseFloat(form.cargo_volume_m3);
    if (form.required_delivery_date) body['required_delivery_date'] = new Date(form.required_delivery_date).toISOString();
    if (form.special_instructions.trim()) body['special_instructions'] = form.special_instructions.trim();

    const result = await api.post<Order>('/api/v1/orders', body, idempotencyKey);
    setSubmitting(false);
    if (result.success && result.data) {
      onSuccess(result.data);
    } else {
      setSubmitError(result.error?.message ?? 'Failed to create order. Please try again.');
    }
  }

  const inputStyle: React.CSSProperties = { borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' };
  const fieldErr = (k: keyof CreateOrderForm) =>
    errors[k] ? <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 3 }}>{errors[k]}</div> : null;

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="create-order-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card border-0 shadow" style={{ borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Modal header */}
        <div className="d-flex align-items-center justify-content-between p-24" style={{ borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div className="d-flex align-items-center gap-12">
            <div className="d-flex align-items-center justify-content-center rounded-circle" style={{ width: 40, height: 40, background: '#f0fdf4' }}>
              <i className="ph ph-package" style={{ fontSize: 20, color: '#299E60' }} />
            </div>
            <h2 id="create-order-title" className="mb-0 fw-bold" style={{ fontSize: 18, color: '#0f172a' }}>Post New Order</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22, lineHeight: 1 }} aria-label="Close">
            <i className="ph ph-x" />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form id="create-order-form" onSubmit={(e) => { void handleSubmit(e); }}>
            <div className="p-24">
              {submitError && (
                <div role="alert" className="d-flex align-items-center gap-8 mb-20"
                  style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
                  <i className="ph ph-warning-circle" style={{ fontSize: 18 }} />{submitError}
                </div>
              )}

              <div className="row g-16">
                {/* Title */}
                <div className="col-12">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                    Order Title <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input type="text" className="form-control" style={inputStyle} value={form.title}
                    onChange={set('title')} placeholder="e.g. Electronics to Germany — June batch" maxLength={500} />
                  {fieldErr('title')}
                </div>

                {/* Origin */}
                <div className="col-12">
                  <div className="fw-semibold mb-8" style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <i className="ph ph-map-pin-simple me-1" style={{ color: '#299E60' }} />Origin
                  </div>
                  <div className="row g-12">
                    <div className="col-md-8">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Address <span style={{ color: '#dc2626' }}>*</span></label>
                      <input type="text" className="form-control" style={inputStyle} value={form.origin_address}
                        onChange={set('origin_address')} placeholder="Street, city, region" />
                      {fieldErr('origin_address')}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Country <span style={{ color: '#dc2626' }}>*</span></label>
                      <select className="form-select" style={inputStyle} value={form.origin_country} onChange={set('origin_country')}>
                        <option value="">Select…</option>
                        {COUNTRY_CODES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                      </select>
                      {fieldErr('origin_country')}
                    </div>
                  </div>
                </div>

                {/* Destination */}
                <div className="col-12">
                  <div className="fw-semibold mb-8" style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <i className="ph ph-map-pin me-1" style={{ color: '#b91c1c' }} />Destination
                  </div>
                  <div className="row g-12">
                    <div className="col-md-8">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Address <span style={{ color: '#dc2626' }}>*</span></label>
                      <input type="text" className="form-control" style={inputStyle} value={form.destination_address}
                        onChange={set('destination_address')} placeholder="Street, city, region" />
                      {fieldErr('destination_address')}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Country <span style={{ color: '#dc2626' }}>*</span></label>
                      <select className="form-select" style={inputStyle} value={form.destination_country} onChange={set('destination_country')}>
                        <option value="">Select…</option>
                        {COUNTRY_CODES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                      </select>
                      {fieldErr('destination_country')}
                    </div>
                  </div>
                </div>

                {/* Cargo */}
                <div className="col-12">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Cargo Description <span style={{ color: '#dc2626' }}>*</span></label>
                  <textarea className="form-control" style={{ ...inputStyle, resize: 'vertical' } as React.CSSProperties} rows={2}
                    value={form.cargo_description} onChange={set('cargo_description')}
                    placeholder="Describe the goods: type, packaging, HS code if known…" maxLength={2000} />
                  {fieldErr('cargo_description')}
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Weight (kg) <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="number" className="form-control" style={inputStyle} min="0.01" step="0.01"
                    value={form.cargo_weight_kg} onChange={set('cargo_weight_kg')} placeholder="e.g. 1200" />
                  {fieldErr('cargo_weight_kg')}
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Volume (m³) <span className="fw-normal" style={{ color: '#94a3b8' }}>(opt)</span></label>
                  <input type="number" className="form-control" style={inputStyle} min="0.01" step="0.01"
                    value={form.cargo_volume_m3} onChange={set('cargo_volume_m3')} placeholder="e.g. 4.5" />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Required By <span className="fw-normal" style={{ color: '#94a3b8' }}>(opt)</span></label>
                  <input type="datetime-local" className="form-control" style={inputStyle}
                    value={form.required_delivery_date} onChange={set('required_delivery_date')} />
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Special Instructions <span className="fw-normal" style={{ color: '#94a3b8' }}>(opt)</span></label>
                  <textarea className="form-control" style={{ ...inputStyle, resize: 'vertical' } as React.CSSProperties} rows={2}
                    value={form.special_instructions} onChange={set('special_instructions')}
                    placeholder="Temperature control, hazmat, fragile handling…" maxLength={5000} />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="d-flex align-items-center justify-content-end gap-8 p-20" style={{ borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button type="button" onClick={onClose}
            className="btn" style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 20px', fontWeight: 500, fontSize: 14 }}>
            Cancel
          </button>
          <button type="submit" form="create-order-form" disabled={submitting}
            className="btn d-flex align-items-center gap-8"
            style={{ background: submitting ? '#86efac' : '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}>
            {submitting
              ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Creating…</>
              : <><i className="ph ph-paper-plane-tilt" /> Post Order</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage(): React.JSX.Element {
  const { profile } = useAuth();
  const canCreate = profile?.role === 'buyer' || profile?.role === 'vendor';

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const { realtimeEvents, isConnected, clearEvents } = useRealtimeOrders();

  const fetchOrders = useCallback(async (p: number, status: string, search: string, dateFrom: string, dateTo: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(p), per_page: String(PAGE_SIZE) });
    if (status)   params.set('status',    status);
    if (search)   params.set('search',    search);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo)   params.set('date_to',   dateTo);
    const result = await api.get<Order[]>(
      `/api/v1/orders?${params.toString()}`,
    );
    if (result.success && result.data) {
      setOrders(result.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else {
      setError(result.error?.message ?? 'Failed to load orders.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchOrders(page, filterStatus, filterSearch, filterDateFrom, filterDateTo); }, [fetchOrders, page, filterStatus, filterSearch, filterDateFrom, filterDateTo]);

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
    void fetchOrders(page, filterStatus, filterSearch, filterDateFrom, filterDateTo);
  };

  return (
    <>
      {/* Modal */}
      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onSuccess={(newOrder) => {
            setOrders(prev => [newOrder, ...prev]);
            setShowCreate(false);
          }}
        />
      )}

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
        <div className="d-flex align-items-center gap-8">
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-sm d-flex align-items-center gap-6"
              style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
            >
              <i className="ph ph-plus" />
              Post Order
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="btn btn-sm d-flex align-items-center gap-6"
            style={{ background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500 }}
          >
            <i className="ph ph-arrows-clockwise" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="alert alert-danger d-flex align-items-center gap-8 mb-20" style={{ borderRadius: 10, fontSize: 14 }}>
          <i className="ph ph-warning-circle" style={{ fontSize: 18 }} />
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="card border-0 shadow-sm mb-20" style={{ borderRadius: 12 }}>
        <div className="card-body py-12 px-20">
          <div className="row g-12 align-items-end">
            <div className="col-md-3">
              <label className="form-label fw-semibold mb-4" style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
              <select className="form-select form-select-sm" style={{ borderRadius: 8, fontSize: 13, borderColor: '#e2e8f0' }}
                value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
                <option value="">All Statuses</option>
                {Object.keys(STATUS_META).map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label fw-semibold mb-4" style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Search Reference</label>
              <input type="text" className="form-control form-control-sm" placeholder="e.g. ORD-…"
                style={{ borderRadius: 8, fontSize: 13, borderColor: '#e2e8f0' }}
                value={filterSearch} onChange={e => { setFilterSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold mb-4" style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>From</label>
              <input type="date" className="form-control form-control-sm"
                style={{ borderRadius: 8, fontSize: 13, borderColor: '#e2e8f0' }}
                value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold mb-4" style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>To</label>
              <input type="date" className="form-control form-control-sm"
                style={{ borderRadius: 8, fontSize: 13, borderColor: '#e2e8f0' }}
                value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} />
            </div>
            <div className="col-md-2">
              {(filterStatus || filterSearch || filterDateFrom || filterDateTo) && (
                <button type="button" className="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-6"
                  style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500 }}
                  onClick={() => { setFilterStatus(''); setFilterSearch(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}>
                  <i className="ph ph-x" /> Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

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
