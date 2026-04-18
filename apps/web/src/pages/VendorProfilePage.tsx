/**
 * VendorProfilePage — /vendors/:id
 *
 * Shows a logistics provider's company profile + their service catalogue.
 * Layout inspired by the MarketPro VendorTwoDetails template component.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Vendor, CatalogueItem, ServiceMode } from '@sbdmm/shared';

// ─── Service mode metadata ────────────────────────────────────────────────────
const MODE_META: Record<
  ServiceMode,
  { label: string; icon: string; bg: string; color: string }
> = {
  FCL: { label: 'FCL', icon: 'ph-container', bg: '#eff6ff', color: '#1d4ed8' },
  LCL: { label: 'LCL', icon: 'ph-package', bg: '#f0fdf4', color: '#15803d' },
  AIR: { label: 'AIR', icon: 'ph-airplane', bg: '#fdf4ff', color: '#7e22ce' },
  ROAD: { label: 'ROAD', icon: 'ph-truck', bg: '#fff7ed', color: '#c2410c' },
  RAIL: { label: 'RAIL', icon: 'ph-train', bg: '#fefce8', color: '#a16207' },
  COURIER: { label: 'COURIER', icon: 'ph-lightning', bg: '#f0fdfa', color: '#0f766e' },
  OTHER: { label: 'OTHER', icon: 'ph-dots-three-circle', bg: '#f8fafc', color: '#475569' },
};

// ─── Blank add-item form state ────────────────────────────────────────────────
const BLANK_ITEM = {
  title: '',
  description: '',
  service_mode: 'FCL' as ServiceMode,
  origin_region: '',
  destination_region: '',
  transit_days_min: 1,
  transit_days_max: 7,
  base_price_amount: '' as string | number,
  base_price_currency: 'USD',
  price_unit: 'per shipment',
  tags: '',
};

type ItemForm = typeof BLANK_ITEM;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function apiFetch<T>(
  path: string,
  token: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body.data as T;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ServiceModeBadge({ mode }: { mode: ServiceMode }) {
  const m = MODE_META[mode] ?? MODE_META.OTHER;
  return (
    <span
      className="d-inline-flex align-items-center gap-1"
      style={{
        background: m.bg,
        color: m.color,
        border: `1px solid ${m.color}30`,
        borderRadius: 20,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      <i className={`ph ${m.icon}`} style={{ fontSize: 12 }} />
      {m.label}
    </span>
  );
}

function CatalogueCard({
  item,
  isAdmin,
  onEdit,
  onDelete,
}: {
  item: CatalogueItem;
  isAdmin: boolean;
  onEdit: (item: CatalogueItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="col-xl-4 col-md-6">
      <div
        className="h-100"
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.boxShadow = '0 4px 20px rgba(41,158,96,0.12)')
        }
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
      >
        {/* Mode badge + title */}
        <div className="d-flex justify-content-between align-items-start gap-8">
          <ServiceModeBadge mode={item.service_mode} />
          {isAdmin && (
            <div className="d-flex gap-6">
              <button
                className="btn btn-sm p-0"
                style={{ width: 28, height: 28, color: '#64748b' }}
                title="Edit"
                onClick={() => onEdit(item)}
              >
                <i className="ph ph-pencil" />
              </button>
              <button
                className="btn btn-sm p-0"
                style={{ width: 28, height: 28, color: '#ef4444' }}
                title="Remove"
                onClick={() => onDelete(item.id)}
              >
                <i className="ph ph-trash" />
              </button>
            </div>
          )}
        </div>

        <h6
          className="mb-0"
          style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', lineHeight: 1.4 }}
        >
          {item.title}
        </h6>

        {item.description && (
          <p
            className="mb-0"
            style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}
          >
            {item.description.length > 100
              ? item.description.slice(0, 100) + '…'
              : item.description}
          </p>
        )}

        {/* Route */}
        <div
          className="d-flex align-items-center gap-6"
          style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}
        >
          <i className="ph ph-map-pin" style={{ color: '#299E60' }} />
          {item.origin_region}
          <i className="ph ph-arrow-right" style={{ color: '#94a3b8', fontSize: 11 }} />
          {item.destination_region}
        </div>

        {/* Transit */}
        <div
          className="d-flex align-items-center gap-6"
          style={{ fontSize: 12, color: '#64748b' }}
        >
          <i className="ph ph-clock" style={{ color: '#299E60' }} />
          {item.transit_days_min === item.transit_days_max
            ? `${item.transit_days_min} days`
            : `${item.transit_days_min}–${item.transit_days_max} days`}
          &nbsp;transit
        </div>

        {/* Price */}
        <div
          style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 'auto',
          }}
        >
          {item.base_price_amount != null ? (
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
              {item.base_price_currency}{' '}
              {Number(item.base_price_amount).toLocaleString('en-US', {
                minimumFractionDigits: 0,
              })}
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                {' '}/ {item.price_unit}
              </span>
            </span>
          ) : (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#7c3aed',
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: 6,
                padding: '3px 10px',
              }}
            >
              Quote on Request
            </span>
          )}
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="d-flex flex-wrap gap-4">
            {item.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Request Quote CTA */}
        <Link
          to="/quotes"
          className="btn w-100"
          style={{
            background: '#f0fdf4',
            color: '#15803d',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 0',
          }}
        >
          <i className="ph ph-paper-plane-tilt me-1" /> Request Quote
        </Link>
      </div>
    </div>
  );
}

// ─── Add / Edit form modal ─────────────────────────────────────────────────────
function ItemFormModal({
  vendorId,
  token,
  editing,
  onDone,
  onClose,
}: {
  vendorId: string;
  token: string;
  editing: CatalogueItem | null;
  onDone: (item: CatalogueItem) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ItemForm>(
    editing
      ? {
          title: editing.title,
          description: editing.description ?? '',
          service_mode: editing.service_mode,
          origin_region: editing.origin_region,
          destination_region: editing.destination_region,
          transit_days_min: editing.transit_days_min,
          transit_days_max: editing.transit_days_max,
          base_price_amount: editing.base_price_amount ?? '',
          base_price_currency: editing.base_price_currency,
          price_unit: editing.price_unit,
          tags: editing.tags.join(', '),
        }
      : BLANK_ITEM,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const change = (key: keyof ItemForm, val: string | number) =>
    setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    setSaving(true);
    setErr('');
    try {
      const payload = {
        ...form,
        transit_days_min: Number(form.transit_days_min),
        transit_days_max: Number(form.transit_days_max),
        base_price_amount: form.base_price_amount === '' ? null : Number(form.base_price_amount),
        tags: String(form.tags)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      let result: CatalogueItem;
      if (editing) {
        result = await apiFetch<CatalogueItem>(
          `/api/v1/vendors/${vendorId}/catalogue/${editing.id}`,
          token,
          { method: 'PATCH', body: JSON.stringify(payload) },
        );
      } else {
        result = await apiFetch<CatalogueItem>(
          `/api/v1/vendors/${vendorId}/catalogue`,
          token,
          { method: 'POST', body: JSON.stringify(payload) },
        );
      }
      onDone(result);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content" style={{ borderRadius: 12 }}>
          <div
            className="modal-header"
            style={{ background: '#1e293b', color: '#fff', borderRadius: '12px 12px 0 0' }}
          >
            <h5 className="modal-title mb-0" style={{ fontSize: 15, fontWeight: 600 }}>
              <i className={`ph ${editing ? 'ph-pencil' : 'ph-plus-circle'} me-2`} />
              {editing ? 'Edit Service' : 'Add Service to Catalogue'}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            />
          </div>
          <div className="modal-body p-24" style={{ background: '#f8fafc' }}>
            {err && (
              <div className="alert alert-danger py-2 px-3" style={{ fontSize: 13 }}>
                {err}
              </div>
            )}
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Service Title *
                </label>
                <input
                  className="form-control"
                  placeholder="e.g. Shanghai → Rotterdam FCL 40HQ"
                  value={form.title}
                  onChange={(e) => change('title', e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Description
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Optional details about this service…"
                  value={form.description}
                  onChange={(e) => change('description', e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Service Mode *
                </label>
                <select
                  className="form-select"
                  value={form.service_mode}
                  onChange={(e) => change('service_mode', e.target.value)}
                >
                  {(Object.keys(MODE_META) as ServiceMode[]).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Origin Region *
                </label>
                <input
                  className="form-control"
                  placeholder="e.g. Shanghai, CN"
                  value={form.origin_region}
                  onChange={(e) => change('origin_region', e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Destination Region *
                </label>
                <input
                  className="form-control"
                  placeholder="e.g. Rotterdam, NL"
                  value={form.destination_region}
                  onChange={(e) => change('destination_region', e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Min Transit (days) *
                </label>
                <input
                  type="number"
                  min={1}
                  className="form-control"
                  value={form.transit_days_min}
                  onChange={(e) => change('transit_days_min', e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Max Transit (days) *
                </label>
                <input
                  type="number"
                  min={1}
                  className="form-control"
                  value={form.transit_days_max}
                  onChange={(e) => change('transit_days_max', e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Currency
                </label>
                <input
                  className="form-control"
                  maxLength={3}
                  value={form.base_price_currency}
                  onChange={(e) => change('base_price_currency', e.target.value.toUpperCase())}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Base Price
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="form-control"
                  placeholder="Leave blank = RFQ"
                  value={form.base_price_amount}
                  onChange={(e) => change('base_price_amount', e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Price Unit
                </label>
                <input
                  className="form-control"
                  placeholder="per shipment"
                  value={form.price_unit}
                  onChange={(e) => change('price_unit', e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold" style={{ fontSize: 12 }}>
                  Tags{' '}
                  <span style={{ fontWeight: 400, color: '#94a3b8' }}>
                    (comma-separated: hazmat, reefer, oversize)
                  </span>
                </label>
                <input
                  className="form-control"
                  placeholder="hazmat, reefer, oversize"
                  value={form.tags}
                  onChange={(e) => change('tags', e.target.value)}
                />
              </div>
            </div>
          </div>
          <div
            className="modal-footer"
            style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}
          >
            <button
              className="btn btn-sm"
              style={{ fontSize: 13, color: '#64748b' }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="btn btn-sm"
              style={{
                background: '#299E60',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontWeight: 600,
                fontSize: 13,
              }}
              disabled={saving}
              onClick={handleSubmit}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Saving…
                </>
              ) : (
                <>
                  <i className={`ph ${editing ? 'ph-floppy-disk' : 'ph-plus'} me-1`} />
                  {editing ? 'Save Changes' : 'Add Service'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VendorProfilePage() {
  const { id: vendorId } = useParams<{ id: string }>();
  const { session, profile } = useAuth();
  const token: string = session?.access_token ?? '';

  const isAdmin =
    profile?.role === 'super_admin' ||
    profile?.role === 'tenant_admin' ||
    profile?.role === 'vendor' ||
    profile?.role === 'logistics_provider';

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogueItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vendorId || !token) return;
    setLoading(true);
    setError('');
    try {
      const [v, c] = await Promise.all([
        apiFetch<Vendor>(`/api/v1/vendors/${vendorId}`, token),
        apiFetch<CatalogueItem[]>(`/api/v1/vendors/${vendorId}/catalogue`, token),
      ]);
      setVendor(v);
      setCatalogue(Array.isArray(c) ? c : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load vendor profile.');
    } finally {
      setLoading(false);
    }
  }, [vendorId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleItemSaved = (item: CatalogueItem) => {
    setCatalogue((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [item, ...prev];
    });
    setShowForm(false);
    setEditingItem(null);
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Remove this service from the catalogue?')) return;
    setDeleting(itemId);
    try {
      await apiFetch(`/api/v1/vendors/${vendorId}/catalogue/${itemId}`, token, {
        method: 'DELETE',
      });
      setCatalogue((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

  // ─── Loading / Error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="d-flex align-items-center justify-content-center"
        style={{ minHeight: 400 }}
      >
        <span className="spinner-border" style={{ color: '#299E60', width: 40, height: 40 }} />
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="container-fluid p-24">
        <div
          className="alert d-flex align-items-center gap-10"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 12,
            color: '#b91c1c',
            fontSize: 13,
          }}
        >
          <i className="ph ph-warning-circle" style={{ fontSize: 20 }} />
          {error || 'Vendor not found.'}
          <Link to="/vendors" className="ms-auto" style={{ fontSize: 12, color: '#64748b' }}>
            ← Back to Vendors
          </Link>
        </div>
      </div>
    );
  }

  const initials = vendor.company_name
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  const complianceColor =
    vendor.compliance_status === 'passed'
      ? '#15803d'
      : vendor.compliance_status === 'failed'
        ? '#dc2626'
        : '#d97706';

  const statusColor =
    vendor.onboarding_status === 'approved' ? '#15803d' : vendor.onboarding_status === 'pending_review' ? '#d97706' : '#dc2626';

  return (
    <>
      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <div
        className="d-flex align-items-center gap-6 mb-3"
        style={{ fontSize: 12, color: '#94a3b8' }}
      >
        <Link to="/vendors" style={{ color: '#64748b', textDecoration: 'none' }}>
          Vendors
        </Link>
        <i className="ph ph-caret-right" style={{ fontSize: 10 }} />
        <span style={{ color: '#1e293b', fontWeight: 500 }}>{vendor.company_name}</span>
      </div>

      {/* ── Profile Header Banner ──────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 16,
          padding: '32px 32px 0',
          marginBottom: 28,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* decorative shapes */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            background: '#299E6015',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 120,
            width: 100,
            height: 100,
            background: '#299E6010',
            borderRadius: '50%',
          }}
        />

        <div className="d-flex flex-wrap align-items-start gap-20" style={{ position: 'relative' }}>
          {/* Logo initial */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              background: '#299E60',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 800,
              color: '#fff',
              flexShrink: 0,
              boxShadow: '0 4px 16px rgba(41,158,96,0.4)',
            }}
          >
            {initials}
          </div>

          {/* Name + badges */}
          <div className="flex-grow-1">
            <h1
              className="mb-1"
              style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}
            >
              {vendor.company_name}
            </h1>
            <div className="d-flex flex-wrap gap-6 mb-12">
              <span
                style={{
                  background: `${statusColor}22`,
                  color: statusColor,
                  border: `1px solid ${statusColor}44`,
                  borderRadius: 20,
                  padding: '2px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {vendor.onboarding_status}
              </span>
              {vendor.compliance_status && (
                <span
                  style={{
                    background: `${complianceColor}22`,
                    color: complianceColor,
                    border: `1px solid ${complianceColor}44`,
                    borderRadius: 20,
                    padding: '2px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  <i className="ph ph-shield-check me-1" />
                  {vendor.compliance_status?.replace('_', ' ')}
                </span>
              )}
              <span
                style={{
                  background: '#334155',
                  color: '#94a3b8',
                  borderRadius: 20,
                  padding: '2px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {vendor.business_category}
              </span>
            </div>

            {/* Contact row */}
            <div
              className="d-flex flex-wrap gap-16"
              style={{ fontSize: 12, color: '#94a3b8' }}
            >
              {vendor.contact_email && (
                <span className="d-flex align-items-center gap-4">
                  <i className="ph ph-envelope" style={{ color: '#299E60' }} />
                  {vendor.contact_email}
                </span>
              )}
              {vendor.contact_phone && (
                <span className="d-flex align-items-center gap-4">
                  <i className="ph ph-phone" style={{ color: '#299E60' }} />
                  {vendor.contact_phone}
                </span>
              )}
              {vendor.country_of_registration && (
                <span className="d-flex align-items-center gap-4">
                  <i className="ph ph-map-pin" style={{ color: '#299E60' }} />
                  {vendor.country_of_registration}
                </span>
              )}
              {vendor.website_url && (
                <a
                  href={vendor.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="d-flex align-items-center gap-4"
                  style={{ color: '#299E60', textDecoration: 'none' }}
                >
                  <i className="ph ph-globe" />
                  Website
                  <i className="ph ph-arrow-square-out" style={{ fontSize: 10 }} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div
          className="d-flex flex-wrap gap-0 mt-24"
          style={{
            borderTop: '1px solid #334155',
            marginLeft: -32,
            marginRight: -32,
          }}
        >
          {[
            {
              icon: 'ph-storefront',
              label: 'Catalogue Items',
              value: catalogue.length.toString(),
            },
            {
              icon: 'ph-calendar-blank',
              label: 'Member Since',
              value: vendor.created_at
                ? new Date(vendor.created_at).getFullYear().toString()
                : '—',
            },
            {
              icon: 'ph-shield',
              label: 'Compliance',
              value: vendor.compliance_status ?? '—',
            },
            {
              icon: 'ph-flag',
              label: 'Country',
              value: vendor.country_of_registration ?? '—',
            },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                flex: '1 1 100px',
                padding: '14px 20px',
                borderRight: i < 3 ? '1px solid #334155' : 'none',
                textAlign: 'center',
              }}
            >
              <i
                className={`ph ${stat.icon}`}
                style={{ fontSize: 18, color: '#299E60', display: 'block', marginBottom: 4 }}
              />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Catalogue Section ──────────────────────────────────────────── */}
      <div className="d-flex align-items-center justify-content-between mb-16">
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
            <i className="ph ph-storefront me-2" style={{ color: '#299E60' }} />
            Service Catalogue
          </h2>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
            {catalogue.length} service{catalogue.length !== 1 ? 's' : ''} available
          </p>
        </div>
        {isAdmin && (
          <button
            className="btn btn-sm d-flex align-items-center gap-6"
            style={{
              background: '#299E60',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: 13,
            }}
            onClick={() => {
              setEditingItem(null);
              setShowForm(true);
            }}
          >
            <i className="ph ph-plus-circle" />
            Add Service
          </button>
        )}
      </div>

      {catalogue.length === 0 ? (
        <div
          className="d-flex flex-column align-items-center justify-content-center"
          style={{
            background: '#fff',
            border: '1px dashed #e2e8f0',
            borderRadius: 16,
            padding: 60,
            color: '#94a3b8',
            textAlign: 'center',
          }}
        >
          <i className="ph ph-storefront" style={{ fontSize: 48, marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#64748b', margin: 0 }}>
            No services listed yet
          </p>
          {isAdmin && (
            <p style={{ fontSize: 12, margin: '6px 0 0' }}>
              Click "Add Service" above to publish this vendor's first catalogue item.
            </p>
          )}
        </div>
      ) : (
        <div className="row g-3">
          {catalogue
            .filter((item) => deleting !== item.id)
            .map((item) => (
              <CatalogueCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onEdit={(i) => {
                  setEditingItem(i);
                  setShowForm(true);
                }}
                onDelete={handleDelete}
              />
            ))}
        </div>
      )}

      {/* ── Add / Edit Modal ───────────────────────────────────────────── */}
      {showForm && (
        <ItemFormModal
          vendorId={vendorId!}
          token={token}
          editing={editingItem}
          onDone={handleItemSaved}
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
        />
      )}
    </>
  );
}
