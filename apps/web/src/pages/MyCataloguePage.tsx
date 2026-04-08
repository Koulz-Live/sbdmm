/**
 * MyCataloguePage — Provider's own service catalogue management.
 *
 * The provider sees all their active catalogue items and can add/edit/delete them
 * directly, without having to navigate to their vendor profile.
 *
 * Flow:
 *  1. GET /api/v1/vendors/me → get vendorId
 *  2. GET /api/v1/vendors/:vendorId/catalogue → list items
 *  3. POST/PATCH/DELETE /api/v1/vendors/:vendorId/catalogue[/:itemId] → manage items
 *
 * Route: /my-catalogue — accessible to vendor | logistics_provider only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import type { CatalogueItem, ServiceMode, Vendor } from '@sbdmm/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

const SERVICE_MODES: ServiceMode[] = ['FCL', 'LCL', 'AIR', 'ROAD', 'RAIL', 'COURIER', 'OTHER'];
const SERVICE_MODE_LABELS: Record<ServiceMode, string> = {
  FCL: 'FCL — Full Container Load',
  LCL: 'LCL — Less than Container Load',
  AIR: 'AIR — Air Freight',
  ROAD: 'ROAD — Road / Trucking',
  RAIL: 'RAIL — Rail Freight',
  COURIER: 'COURIER — Express Courier',
  OTHER: 'Other',
};
const SERVICE_MODE_ICONS: Record<ServiceMode, string> = {
  FCL: 'ph-container', LCL: 'ph-package', AIR: 'ph-airplane',
  ROAD: 'ph-truck', RAIL: 'ph-train', COURIER: 'ph-lightning', OTHER: 'ph-cube',
};

interface CatalogueForm {
  title: string;
  description: string;
  service_mode: ServiceMode;
  origin_region: string;
  destination_region: string;
  transit_days_min: string;
  transit_days_max: string;
  base_price_amount: string;
  base_price_currency: string;
  price_unit: string;
  tags: string;
}

const BLANK_FORM: CatalogueForm = {
  title: '', description: '', service_mode: 'FCL',
  origin_region: '', destination_region: '',
  transit_days_min: '', transit_days_max: '',
  base_price_amount: '', base_price_currency: 'USD',
  price_unit: 'per shipment', tags: '',
};

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'CNY', 'AED', 'SGD'];

function formToPayload(form: CatalogueForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    service_mode: form.service_mode,
    origin_region: form.origin_region.trim(),
    destination_region: form.destination_region.trim(),
    transit_days_min: parseInt(form.transit_days_min, 10),
    transit_days_max: parseInt(form.transit_days_max, 10),
    base_price_currency: form.base_price_currency,
    price_unit: form.price_unit.trim() || 'per shipment',
    tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  };
  if (form.description.trim()) payload['description'] = form.description.trim();
  if (form.base_price_amount) {
    const amt = parseFloat(form.base_price_amount);
    if (!isNaN(amt) && amt > 0) payload['base_price_amount'] = amt;
  }
  return payload;
}

// ─── Catalogue Item Card ──────────────────────────────────────────────────────

interface ItemCardProps {
  item: CatalogueItem;
  onEdit: (item: CatalogueItem) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}

function ItemCard({ item, onEdit, onDelete, deleting }: ItemCardProps): React.JSX.Element {
  const icon = SERVICE_MODE_ICONS[item.service_mode] ?? 'ph-cube';
  const hasPrice = item.base_price_amount != null;

  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
      <div className="card-body p-20">
        <div className="d-flex align-items-start justify-content-between gap-12 mb-12">
          <div className="d-flex align-items-center gap-10">
            <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: 40, height: 40, background: '#f0fdf4' }}>
              <i className={`ph ${icon}`} style={{ fontSize: 20, color: '#299E60' }} />
            </div>
            <div>
              <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.3 }}>{item.title}</div>
              <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                {item.service_mode}
              </span>
            </div>
          </div>
          <div className="d-flex gap-6 flex-shrink-0">
            <button onClick={() => onEdit(item)}
              className="btn btn-sm d-flex align-items-center gap-4"
              style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, padding: '4px 10px' }}>
              <i className="ph ph-pencil" />Edit
            </button>
            <button onClick={() => onDelete(item.id)} disabled={deleting}
              className="btn btn-sm d-flex align-items-center gap-4"
              style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, padding: '4px 10px', opacity: deleting ? 0.6 : 1 }}>
              <i className="ph ph-trash" />
            </button>
          </div>
        </div>

        <div className="d-flex align-items-center gap-6 mb-8" style={{ fontSize: 13, color: '#374151' }}>
          <i className="ph ph-map-pin" style={{ color: '#299E60', fontSize: 14 }} />
          <span>{item.origin_region}</span>
          <i className="ph ph-arrow-right" style={{ color: '#94a3b8', fontSize: 12 }} />
          <span>{item.destination_region}</span>
        </div>

        <div className="d-flex align-items-center gap-16 flex-wrap" style={{ fontSize: 12, color: '#64748b' }}>
          <span className="d-flex align-items-center gap-4">
            <i className="ph ph-clock" style={{ fontSize: 13 }} />
            {item.transit_days_min}–{item.transit_days_max} days
          </span>
          {hasPrice ? (
            <span className="d-flex align-items-center gap-4 fw-semibold" style={{ color: '#0f172a' }}>
              <i className="ph ph-currency-dollar" style={{ fontSize: 13 }} />
              {item.base_price_amount!.toLocaleString('en-US', { style: 'currency', currency: item.base_price_currency })}
              &nbsp;<span className="fw-normal" style={{ color: '#64748b' }}>/ {item.price_unit}</span>
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Quote on request</span>
          )}
        </div>

        {item.tags.length > 0 && (
          <div className="d-flex flex-wrap gap-6 mt-10">
            {item.tags.map(tag => (
              <span key={tag}
                style={{ background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '2px 8px', fontSize: 11 }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {item.description && (
          <p className="mt-8 mb-0" style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
            {item.description.length > 100 ? item.description.slice(0, 100) + '…' : item.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Item Form Modal ──────────────────────────────────────────────────────────

interface ItemFormModalProps {
  vendorId: string;
  editItem: CatalogueItem | null;
  onSuccess: (item: CatalogueItem) => void;
  onClose: () => void;
}

function ItemFormModal({ vendorId, editItem, onSuccess, onClose }: ItemFormModalProps): React.JSX.Element {
  const [form, setForm] = useState<CatalogueForm>(() => {
    if (editItem) {
      return {
        title: editItem.title,
        description: editItem.description ?? '',
        service_mode: editItem.service_mode,
        origin_region: editItem.origin_region,
        destination_region: editItem.destination_region,
        transit_days_min: String(editItem.transit_days_min),
        transit_days_max: String(editItem.transit_days_max),
        base_price_amount: editItem.base_price_amount != null ? String(editItem.base_price_amount) : '',
        base_price_currency: editItem.base_price_currency,
        price_unit: editItem.price_unit,
        tags: editItem.tags.join(', '),
      };
    }
    return BLANK_FORM;
  });

  const [errors, setErrors] = useState<Partial<CatalogueForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (field: keyof CatalogueForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  function validate(): boolean {
    const e: Partial<CatalogueForm> = {};
    if (!form.title.trim()) e.title = 'Title is required.';
    if (!form.origin_region.trim()) e.origin_region = 'Origin region is required.';
    if (!form.destination_region.trim()) e.destination_region = 'Destination region is required.';
    const min = parseInt(form.transit_days_min, 10);
    const max = parseInt(form.transit_days_max, 10);
    if (isNaN(min) || min < 1) e.transit_days_min = 'Enter ≥ 1.';
    if (isNaN(max) || max < min) e.transit_days_max = 'Must be ≥ min.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    const payload = formToPayload(form);

    let res;
    if (editItem) {
      res = await api.patch<CatalogueItem>(`/api/v1/vendors/${vendorId}/catalogue/${editItem.id}`, payload);
    } else {
      res = await api.post<CatalogueItem>(`/api/v1/vendors/${vendorId}/catalogue`, payload);
    }
    setSubmitting(false);

    if (res.success && res.data) {
      onSuccess(res.data);
    } else {
      setSubmitError(res.error?.message ?? 'Failed to save item.');
    }
  }

  const inputStyle: React.CSSProperties = { borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' };
  const errTxt = (k: keyof CatalogueForm): React.ReactNode =>
    errors[k] ? <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 3 }}>{errors[k]}</div> : null;

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card border-0 shadow" style={{ borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between p-24" style={{ borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div className="d-flex align-items-center gap-12">
            <div className="d-flex align-items-center justify-content-center rounded-circle" style={{ width: 40, height: 40, background: '#f0fdf4' }}>
              <i className="ph ph-storefront" style={{ fontSize: 20, color: '#299E60' }} />
            </div>
            <h2 className="mb-0 fw-bold" style={{ fontSize: 17, color: '#0f172a' }}>
              {editItem ? 'Edit Catalogue Item' : 'Add Catalogue Item'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22, lineHeight: 1 }}>
            <i className="ph ph-x" />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <form id="catalogue-item-form" onSubmit={e => { void handleSubmit(e); }}>
            <div className="p-24">
              {submitError && (
                <div role="alert" className="d-flex align-items-center gap-8 mb-20"
                  style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
                  <i className="ph ph-warning-circle" />{submitError}
                </div>
              )}
              <div className="row g-16">
                <div className="col-12">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Title <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="text" className="form-control" style={inputStyle} value={form.title} onChange={set('title')}
                    placeholder="e.g. Shanghai → Rotterdam FCL 40HQ" maxLength={200} />
                  {errTxt('title')}
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Origin Region <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="text" className="form-control" style={inputStyle} value={form.origin_region} onChange={set('origin_region')}
                    placeholder="e.g. Shanghai, China" maxLength={100} />
                  {errTxt('origin_region')}
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Destination Region <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="text" className="form-control" style={inputStyle} value={form.destination_region} onChange={set('destination_region')}
                    placeholder="e.g. Rotterdam, Netherlands" maxLength={100} />
                  {errTxt('destination_region')}
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Service Mode <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className="form-select" style={inputStyle} value={form.service_mode}
                    onChange={e => setForm(f => ({ ...f, service_mode: e.target.value as ServiceMode }))}>
                    {SERVICE_MODES.map(m => <option key={m} value={m}>{SERVICE_MODE_LABELS[m]}</option>)}
                  </select>
                </div>

                <div className="col-md-3">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Min Days <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="number" className="form-control" style={inputStyle} min="1" step="1"
                    value={form.transit_days_min} onChange={set('transit_days_min')} placeholder="e.g. 18" />
                  {errTxt('transit_days_min')}
                </div>

                <div className="col-md-3">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Max Days <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="number" className="form-control" style={inputStyle} min="1" step="1"
                    value={form.transit_days_max} onChange={set('transit_days_max')} placeholder="e.g. 24" />
                  {errTxt('transit_days_max')}
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                    Base Price <span className="fw-normal" style={{ color: '#94a3b8' }}>(optional)</span>
                  </label>
                  <input type="number" className="form-control" style={inputStyle} min="0.01" step="0.01"
                    value={form.base_price_amount} onChange={set('base_price_amount')} placeholder="Leave blank = quote on request" />
                </div>

                <div className="col-md-3">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Currency</label>
                  <select className="form-select" style={inputStyle} value={form.base_price_currency} onChange={set('base_price_currency')}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="col-md-5">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Price Unit</label>
                  <input type="text" className="form-control" style={inputStyle} value={form.price_unit} onChange={set('price_unit')}
                    placeholder="per shipment / per CBM / per kg" maxLength={50} />
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                    Tags <span className="fw-normal" style={{ color: '#94a3b8' }}>(comma-separated, optional)</span>
                  </label>
                  <input type="text" className="form-control" style={inputStyle} value={form.tags} onChange={set('tags')}
                    placeholder="hazmat, reefer, oversize" maxLength={300} />
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                    Description <span className="fw-normal" style={{ color: '#94a3b8' }}>(optional)</span>
                  </label>
                  <textarea className="form-control" style={{ ...inputStyle, resize: 'vertical' } as React.CSSProperties} rows={3}
                    value={form.description} onChange={set('description')}
                    placeholder="Service details, coverage, special capabilities…" maxLength={2000} />
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
          <button type="submit" form="catalogue-item-form" disabled={submitting}
            className="btn d-flex align-items-center gap-8"
            style={{ background: submitting ? '#86efac' : '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}>
            {submitting
              ? <><span className="spinner-border spinner-border-sm" role="status" /> Saving…</>
              : <><i className={`ph ${editItem ? 'ph-check' : 'ph-plus'}`} /> {editItem ? 'Save Changes' : 'Add Item'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyCataloguePage(): React.JSX.Element {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<CatalogueItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    // Step 1: get own vendor record
    const meRes = await api.get<Vendor>('/api/v1/vendors/me');
    if (!meRes.success || !meRes.data) {
      setError(meRes.error?.message ?? 'Could not load your vendor profile.');
      setLoading(false);
      return;
    }
    setVendor(meRes.data);

    // Step 2: get catalogue items
    const catRes = await api.get<CatalogueItem[]>(`/api/v1/vendors/${meRes.data.id}/catalogue`);
    if (catRes.success && catRes.data) {
      setItems(catRes.data);
    } else {
      setError(catRes.error?.message ?? 'Failed to load catalogue.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleDelete = async (itemId: string): Promise<void> => {
    if (!vendor) return;
    setDeletingId(itemId);
    const res = await api.delete(`/api/v1/vendors/${vendor.id}/catalogue/${itemId}`);
    if (res.success) {
      setItems(prev => prev.filter(i => i.id !== itemId));
      setActionMsg({ type: 'success', text: 'Item removed from catalogue.' });
      setTimeout(() => setActionMsg(null), 3000);
    } else {
      setActionMsg({ type: 'error', text: res.error?.message ?? 'Failed to delete item.' });
    }
    setDeletingId(null);
  };

  const handleFormSuccess = (item: CatalogueItem): void => {
    if (editItem) {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
      setActionMsg({ type: 'success', text: 'Catalogue item updated.' });
    } else {
      setItems(prev => [item, ...prev]);
      setActionMsg({ type: 'success', text: 'New catalogue item added.' });
    }
    setShowForm(false);
    setEditItem(null);
    setTimeout(() => setActionMsg(null), 3000);
  };

  // ── No vendor profile found ────────────────────────────────────────────────
  if (!loading && !vendor && !error) {
    return (
      <div className="card border-0 shadow-sm text-center py-5" style={{ borderRadius: 12, maxWidth: 560 }}>
        <i className="ph ph-storefront" style={{ fontSize: 48, color: '#e2e8f0', display: 'block', marginBottom: 16 }} />
        <h2 className="fw-bold mb-8" style={{ fontSize: 18, color: '#0f172a' }}>No vendor profile yet</h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
          You need a vendor profile before you can manage your catalogue.
        </p>
        <Link to="/vendors/me"
          className="btn mx-auto d-inline-flex align-items-center gap-8"
          style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}>
          <i className="ph ph-arrow-right" /> Set Up Profile
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-24 flex-wrap gap-12">
        <div>
          <h1 className="fw-bold mb-4" style={{ fontSize: 22, color: '#0f172a' }}>
            <i className="ph ph-storefront me-10" style={{ color: '#299E60' }} />
            My Catalogue
          </h1>
          {vendor && (
            <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
              <span className="fw-semibold" style={{ color: '#0f172a' }}>{vendor.company_name}</span>
              &nbsp;· {items.length} active service{items.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => { setEditItem(null); setShowForm(true); }}
          className="btn d-flex align-items-center gap-8"
          style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14 }}>
          <i className="ph ph-plus" />
          Add Service
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className="d-flex align-items-center gap-8 mb-20"
          style={{
            background: actionMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: actionMsg.type === 'success' ? '#15803d' : '#b91c1c',
            border: `1px solid ${actionMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: 8, padding: '10px 14px', fontSize: 14,
          }}>
          <i className={`ph ${actionMsg.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'}`} />
          {actionMsg.text}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div role="alert" className="d-flex align-items-center gap-8 mb-20"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
          <i className="ph ph-warning-circle" />{error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="d-flex align-items-center justify-content-center py-64" style={{ color: '#64748b' }}>
          <span className="spinner-border me-2" style={{ color: '#299E60' }} role="status" />
          Loading catalogue…
        </div>
      ) : items.length === 0 ? (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body text-center py-64">
            <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16"
              style={{ width: 72, height: 72, background: '#f0fdf4' }}>
              <i className="ph ph-storefront" style={{ fontSize: 32, color: '#299E60' }} />
            </div>
            <p className="fw-semibold mb-4" style={{ fontSize: 16, color: '#374151' }}>Your catalogue is empty</p>
            <p className="mb-24" style={{ fontSize: 13, color: '#94a3b8' }}>
              Add your service lanes so buyers can find and quote you on matching orders.
            </p>
            <button
              onClick={() => { setEditItem(null); setShowForm(true); }}
              className="btn d-inline-flex align-items-center gap-8"
              style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}>
              <i className="ph ph-plus" /> Add Your First Service
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-16">
          {items.map(item => (
            <div key={item.id} className="col-lg-6 col-xl-4">
              <ItemCard
                item={item}
                onEdit={i => { setEditItem(i); setShowForm(true); }}
                onDelete={(id) => { void handleDelete(id); }}
                deleting={deletingId === item.id}
              />
            </div>
          ))}
        </div>
      )}

      {/* Mode counts row */}
      {!loading && items.length > 0 && (
        <div className="d-flex flex-wrap gap-8 mt-20">
          {SERVICE_MODES.filter(m => items.some(i => i.service_mode === m)).map(m => {
            const count = items.filter(i => i.service_mode === m).length;
            return (
              <span key={m} style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
                <i className={`ph ${SERVICE_MODE_ICONS[m]} me-4`} />
                {m} · {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && vendor && (
        <ItemFormModal
          vendorId={vendor.id}
          editItem={editItem}
          onSuccess={handleFormSuccess}
          onClose={() => { setShowForm(false); setEditItem(null); }}
        />
      )}
    </div>
  );
}
