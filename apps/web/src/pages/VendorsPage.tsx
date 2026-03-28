/**
 * VendorsPage — Vendor list with onboarding modal.
 *
 * Roles that can see this page: tenant_admin, super_admin.
 * The "Onboard Vendor" action is also tenant_admin / super_admin only
 * (enforced server-side; the button is hidden for other roles).
 *
 * Compliance status badges use a colour-coded system consistent with
 * the rest of the platform: pending=amber, passed=green, failed=red,
 * manual_review=orange.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import type { Vendor, BusinessCategory, PaginationMeta } from '@sbdmm/shared';

const PAGE_SIZE = 20;

const BUSINESS_CATEGORIES: BusinessCategory[] = [
  'freight', 'warehousing', 'customs', 'last_mile', 'freight_forwarding', 'other',
];

interface OnboardForm {
  company_name: string;
  company_registration_number: string;
  country_of_registration: string;
  contact_email: string;
  contact_phone: string;
  business_category: BusinessCategory;
  website_url: string;
}

const EMPTY_FORM: OnboardForm = {
  company_name: '',
  company_registration_number: '',
  country_of_registration: '',
  contact_email: '',
  contact_phone: '',
  business_category: 'freight',
  website_url: '',
};

export default function VendorsPage(): React.JSX.Element {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'tenant_admin' || profile?.role === 'super_admin';

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Onboard modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<OnboardForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const fetchVendors = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const result = await api.get<{ data: Vendor[]; total: number }>(
      `/api/v1/vendors?page=${p}&per_page=${PAGE_SIZE}`,
    );
    if (result.success && result.data) {
      setVendors(result.data.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else {
      setError(result.error?.message ?? 'Failed to load vendors.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchVendors(page);
  }, [fetchVendors, page]);

  const handleFieldChange = (field: keyof OnboardForm, value: string): void => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    const body: Record<string, string | null> = {
      company_name: form.company_name,
      company_registration_number: form.company_registration_number,
      country_of_registration: form.country_of_registration,
      contact_email: form.contact_email,
      business_category: form.business_category,
      contact_phone: form.contact_phone || null,
      website_url: form.website_url || null,
    };

    const result = await api.post<Vendor>('/api/v1/vendors/onboard', body);
    if (result.success) {
      setFormSuccess(true);
      setForm(EMPTY_FORM);
      setTimeout(() => {
        setShowModal(false);
        setFormSuccess(false);
        void fetchVendors(1);
        setPage(1);
      }, 1500);
    } else {
      setFormError(result.error?.message ?? 'Onboarding failed.');
    }
    setIsSubmitting(false);
  };

  const handleStatusChange = async (id: string, status: 'approved' | 'rejected' | 'suspended'): Promise<void> => {
    const result = await api.patch<Vendor>(`/api/v1/vendors/${id}/status`, { status });
    if (result.success) {
      setVendors((prev) => prev.map((v) => (v.id === id && result.data ? result.data : v)));
    }
  };

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Vendors</h1>
        {isAdmin && (
          <VButton onClick={() => { setShowModal(true); setFormError(null); setFormSuccess(false); }}>
            + Onboard Vendor
          </VButton>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingState label="Loading vendors…" />
      ) : vendors.length === 0 ? (
        <EmptyState label="No vendors found. Use 'Onboard Vendor' to add the first one." />
      ) : (
        <>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <Th>Company</Th>
                  <Th>Category</Th>
                  <Th>Country</Th>
                  <Th>Status</Th>
                  <Th>Compliance</Th>
                  {isAdmin && <Th>Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td>
                      <div style={{ fontWeight: 500 }}>{vendor.company_name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{vendor.contact_email}</div>
                    </Td>
                    <Td>{vendor.business_category.replace(/_/g, ' ')}</Td>
                    <Td>{vendor.country_of_registration}</Td>
                    <Td><VendorStatusBadge status={vendor.status} /></Td>
                    <Td><ComplianceBadge status={vendor.compliance_status} /></Td>
                    {isAdmin && (
                      <Td>
                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                          {vendor.status === 'pending_review' && (
                            <>
                              <ActionButton color="#16a34a" onClick={() => void handleStatusChange(vendor.id, 'approved')}>Approve</ActionButton>
                              <ActionButton color="#ef4444" onClick={() => void handleStatusChange(vendor.id, 'rejected')}>Reject</ActionButton>
                            </>
                          )}
                          {vendor.status === 'approved' && (
                            <ActionButton color="#f97316" onClick={() => void handleStatusChange(vendor.id, 'suspended')}>Suspend</ActionButton>
                          )}
                          {vendor.status === 'suspended' && (
                            <ActionButton color="#16a34a" onClick={() => void handleStatusChange(vendor.id, 'approved')}>Reinstate</ActionButton>
                          )}
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              <span>Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total}</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <VButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</VButton>
                <VButton onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}>Next →</VButton>
              </div>
            </div>
          )}
        </>
      )}

      {/* Onboard Vendor Modal */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Onboard Vendor</h2>

          {formSuccess ? (
            <div style={{ padding: 'var(--space-4)', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', color: '#16a34a', textAlign: 'center' }}>
              ✓ Vendor onboarded — compliance check running…
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              {formError && <ErrorBanner message={formError} />}

              <FormField label="Company Name *">
                <input required value={form.company_name} onChange={(e) => handleFieldChange('company_name', e.target.value)} style={inputStyle} placeholder="Acme Logistics Ltd" />
              </FormField>
              <FormField label="Registration Number *">
                <input required value={form.company_registration_number} onChange={(e) => handleFieldChange('company_registration_number', e.target.value)} style={inputStyle} placeholder="UK123456" />
              </FormField>
              <FormField label="Country of Registration *">
                <input required value={form.country_of_registration} onChange={(e) => handleFieldChange('country_of_registration', e.target.value)} style={inputStyle} placeholder="GB" maxLength={2} />
              </FormField>
              <FormField label="Contact Email *">
                <input required type="email" value={form.contact_email} onChange={(e) => handleFieldChange('contact_email', e.target.value)} style={inputStyle} placeholder="contact@vendor.com" />
              </FormField>
              <FormField label="Contact Phone">
                <input type="tel" value={form.contact_phone} onChange={(e) => handleFieldChange('contact_phone', e.target.value)} style={inputStyle} placeholder="+44 20 0000 0000" />
              </FormField>
              <FormField label="Business Category *">
                <select required value={form.business_category} onChange={(e) => handleFieldChange('business_category', e.target.value)} style={inputStyle}>
                  {BUSINESS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Website URL">
                <input type="url" value={form.website_url} onChange={(e) => handleFieldChange('website_url', e.target.value)} style={inputStyle} placeholder="https://vendor.com" />
              </FormField>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
                <VButton onClick={() => setShowModal(false)} disabled={isSubmitting}>Cancel</VButton>
                <button type="submit" disabled={isSubmitting} style={{ ...primaryButtonStyle, opacity: isSubmitting ? 0.7 : 1 }}>
                  {isSubmitting ? 'Submitting…' : 'Onboard Vendor'}
                </button>
              </div>
            </form>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function VButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function ActionButton({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }): React.JSX.Element {
  return (
    <button onClick={onClick} style={{ padding: '2px var(--space-2)', background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-xs)', color, fontWeight: 500 }}>
      {children}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return (
    <div role="alert" style={{ padding: 'var(--space-4)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', marginBottom: 'var(--space-4)' }}>
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

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }): React.JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-sm)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  boxSizing: 'border-box',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-6)',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
};

const VENDOR_STATUS_COLORS: Record<string, string> = {
  pending_review: '#f59e0b',
  approved: '#16a34a',
  rejected: '#ef4444',
  suspended: '#6b7280',
};

function VendorStatusBadge({ status }: { status: string }): React.JSX.Element {
  const color = VENDOR_STATUS_COLORS[status] ?? '#6b7280';
  return (
    <span style={{ display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 500, background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const COMPLIANCE_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  passed: '#16a34a',
  failed: '#ef4444',
  manual_review: '#f97316',
};

function ComplianceBadge({ status }: { status: string }): React.JSX.Element {
  const color = COMPLIANCE_COLORS[status] ?? '#6b7280';
  return (
    <span style={{ display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 500, background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
