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
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useAiProxy } from '../hooks/useAiProxy';
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
    const result = await api.get<Vendor[]>(
      `/api/v1/vendors?page=${p}&per_page=${PAGE_SIZE}`,
    );
    if (result.success && result.data) {
      setVendors(result.data ?? []);
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
    <>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-24">
        <div />
        {isAdmin && (
          <button
            onClick={() => { setShowModal(true); setFormError(null); setFormSuccess(false); }}
            className="btn d-flex align-items-center gap-8"
            style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500 }}
          >
            <i className="ph ph-plus" />
            Onboard Vendor
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="alert alert-danger d-flex align-items-center gap-8 mb-20" style={{ borderRadius: 10, fontSize: 14 }}>
          <i className="ph ph-warning-circle" style={{ fontSize: 18 }} />
          {error}
        </div>
      )}

      {/* Vendor card grid */}
      {isLoading ? (
        <div className="d-flex align-items-center justify-content-center py-64" aria-live="polite" aria-busy="true">
          <div className="spinner-border" style={{ color: '#299E60' }} role="status">
            <span className="visually-hidden">Loading vendors…</span>
          </div>
        </div>
      ) : vendors.length === 0 ? (
        <div className="d-flex flex-column align-items-center justify-content-center py-64 text-center">
          <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16" style={{ width: 64, height: 64, background: 'var(--bg-surface-3)' }}>
            <i className="ph ph-storefront" style={{ fontSize: 28, color: 'var(--text-muted)' }} />
          </div>
          <p className="fw-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>No vendors yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Use "Onboard Vendor" to add the first one.</p>
        </div>
      ) : (
        <>
          <div className="row g-20 mb-24">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="col-xl-3 col-lg-4 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                >
                  <div className="card-body p-20">
                    {/* Vendor logo placeholder */}
                    <div className="d-flex align-items-center gap-12 mb-16">
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-white flex-shrink-0"
                        style={{ width: 48, height: 48, background: '#299E60', fontSize: 18 }}
                      >
                        {vendor.company_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div className="fw-semibold text-truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{vendor.company_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{vendor.business_category.replace(/_/g, ' ')}</div>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-6 mb-8" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <i className="ph ph-map-pin" />
                      {vendor.country_of_registration}
                    </div>
                    <div className="d-flex align-items-center gap-6 mb-16" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <i className="ph ph-envelope" />
                      <span className="text-truncate">{vendor.contact_email}</span>
                    </div>

                    <div className="d-flex align-items-center gap-8 flex-wrap mb-12">
                      <VendorStatusBadge status={vendor.onboarding_status} />
                      <ComplianceBadge status={vendor.compliance_status} />
                    </div>

                    {isAdmin && (
                      <div className="d-flex gap-8 flex-wrap mt-12 pt-12" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        {vendor.onboarding_status === 'pending_review' && (
                          <>
                            <button onClick={() => void handleStatusChange(vendor.id, 'approved')}
                              className="btn btn-sm btn-success d-flex align-items-center gap-4">
                              <i className="ph ph-check" /> Approve
                            </button>
                            <button onClick={() => void handleStatusChange(vendor.id, 'rejected')}
                              className="btn btn-sm btn-danger d-flex align-items-center gap-4">
                              <i className="ph ph-x" /> Reject
                            </button>
                          </>
                        )}
                        {vendor.onboarding_status === 'approved' && (
                          <button onClick={() => void handleStatusChange(vendor.id, 'suspended')}
                            className="btn btn-sm btn-warning d-flex align-items-center gap-4">
                            <i className="ph ph-pause-circle" /> Suspend
                          </button>
                        )}
                        {vendor.onboarding_status === 'suspended' && (
                          <button onClick={() => void handleStatusChange(vendor.id, 'approved')}
                            className="btn btn-sm btn-success d-flex align-items-center gap-4">
                            <i className="ph ph-play-circle" /> Reinstate
                          </button>
                        )}
                      </div>
                    )}

                    {/* View Profile — always visible */}
                    <Link
                      to={`/vendors/${vendor.id}`}
                      className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center gap-6 w-100 mt-10"
                      style={{ borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '7px 0', textDecoration: 'none' }}
                    >
                      <i className="ph ph-storefront" style={{ color: '#299E60' }} /> View Profile &amp; Catalogue
                    </Link>

                    {/* AI vendor assessment (admins only) */}
                    {isAdmin && <VendorAiPanel vendor={vendor} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination && (
            <div className="d-flex align-items-center justify-content-between mt-8">
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total} vendors
              </span>
              <div className="d-flex gap-8">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="btn btn-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, fontSize: 13, opacity: page === 1 ? 0.4 : 1 }}>
                  <i className="ph ph-caret-left" /> Prev
                </button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}
                  className="btn btn-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, fontSize: 13, opacity: page >= pagination.total_pages ? 0.4 : 1 }}>
                  Next <i className="ph ph-caret-right" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Onboard Vendor Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}
        >
          <div className="card border-0 shadow-lg" style={{ borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', margin: 16 }}>
            <div className="card-body p-32">
              <div className="d-flex align-items-center justify-content-between mb-24">
                <h2 className="fw-bold mb-0" style={{ fontSize: 18, color: 'var(--text-primary)' }}>Onboard Vendor</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>
                  <i className="ph ph-x" />
                </button>
              </div>

              {formSuccess ? (
                <div className="d-flex flex-column align-items-center py-32 text-center">
                  <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16" style={{ width: 64, height: 64, background: '#f0fdf4' }}>
                    <i className="ph ph-check-circle" style={{ fontSize: 32, color: '#15803d' }} />
                  </div>
                  <p className="fw-semibold mb-4" style={{ color: '#15803d' }}>Vendor onboarded successfully!</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Compliance check is now running in the background.</p>
                </div>
              ) : (
                <form onSubmit={(e) => void handleSubmit(e)}>
                  {formError && (
                    <div role="alert" className="alert alert-danger d-flex align-items-center gap-8 mb-20" style={{ borderRadius: 8, fontSize: 13 }}>
                      <i className="ph ph-warning-circle" />
                      {formError}
                    </div>
                  )}

                  <div className="row g-16">
                    <div className="col-12">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Company Name *</label>
                      <input required className="form-control" value={form.company_name} onChange={(e) => handleFieldChange('company_name', e.target.value)} placeholder="Acme Logistics Ltd" style={{ borderRadius: 8, fontSize: 14 }} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Registration Number *</label>
                      <input required className="form-control" value={form.company_registration_number} onChange={(e) => handleFieldChange('company_registration_number', e.target.value)} placeholder="UK123456" style={{ borderRadius: 8, fontSize: 14 }} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Country Code *</label>
                      <input required className="form-control" value={form.country_of_registration} onChange={(e) => handleFieldChange('country_of_registration', e.target.value)} placeholder="GB" maxLength={2} style={{ borderRadius: 8, fontSize: 14 }} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Contact Email *</label>
                      <input required type="email" className="form-control" value={form.contact_email} onChange={(e) => handleFieldChange('contact_email', e.target.value)} placeholder="contact@vendor.com" style={{ borderRadius: 8, fontSize: 14 }} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Contact Phone</label>
                      <input type="tel" className="form-control" value={form.contact_phone} onChange={(e) => handleFieldChange('contact_phone', e.target.value)} placeholder="+44 20 0000 0000" style={{ borderRadius: 8, fontSize: 14 }} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Business Category *</label>
                      <select required className="form-select" value={form.business_category} onChange={(e) => handleFieldChange('business_category', e.target.value)} style={{ borderRadius: 8, fontSize: 14 }}>
                        {BUSINESS_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Website URL</label>
                      <input type="url" className="form-control" value={form.website_url} onChange={(e) => handleFieldChange('website_url', e.target.value)} placeholder="https://vendor.com" style={{ borderRadius: 8, fontSize: 14 }} />
                    </div>
                  </div>

                  <div className="d-flex justify-content-end gap-8 mt-24">
                    <button type="button" onClick={() => setShowModal(false)} disabled={isSubmitting}
                      className="btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, fontSize: 14 }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting}
                      className="btn d-flex align-items-center gap-8"
                      style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, opacity: isSubmitting ? 0.7 : 1 }}>
                      {isSubmitting ? <><span className="spinner-border spinner-border-sm" /> Submitting…</> : <><i className="ph ph-check" /> Onboard Vendor</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

// AI vendor assessment panel (admin only) — vendor_summary + esg_analysis
function VendorAiPanel({ vendor }: { vendor: Vendor }): React.JSX.Element {
  const { loading: assessLoading, result: assessResult, error: assessError, run: assessRun, reset: assessReset } = useAiProxy();
  const { loading: esgLoading, result: esgResult, error: esgError, run: esgRun, reset: esgReset } = useAiProxy();
  const [panel, setPanel] = useState<'none' | 'assess' | 'esg'>('none');

  const handleAssess = (): void => {
    setPanel('assess');
    assessReset();
    void assessRun('vendor_summary', {
      company_name: vendor.company_name,
      business_category: vendor.business_category,
      country_of_registration: vendor.country_of_registration,
      onboarding_status: vendor.onboarding_status,
      compliance_status: vendor.compliance_status,
    });
  };

  const handleEsg = (): void => {
    setPanel('esg');
    esgReset();
    void esgRun('esg_analysis', {
      company_name: vendor.company_name,
      business_category: vendor.business_category,
      country_of_registration: vendor.country_of_registration,
    });
  };

  return (
    <div className="mt-10 pt-10" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="d-flex gap-6 flex-wrap mb-8">
        <button type="button"
          onClick={panel === 'assess' ? () => setPanel('none') : handleAssess}
          disabled={assessLoading}
          className={`btn btn-sm d-flex align-items-center gap-4 ${panel === 'assess' ? 'btn-success' : 'btn-outline-secondary'}`}>
          {assessLoading && panel === 'assess'
            ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /></>
            : <><i className="ph ph-sparkle" /> AI Assess</>}
        </button>
        <button type="button"
          onClick={panel === 'esg' ? () => setPanel('none') : handleEsg}
          disabled={esgLoading}
          className={`btn btn-sm d-flex align-items-center gap-4 ${panel === 'esg' ? 'btn-success' : 'btn-outline-secondary'}`}>
          {esgLoading && panel === 'esg'
            ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /></>
            : <><i className="ph ph-leaf" /> ESG Check</>}
        </button>
      </div>

      {/* AI Assess result */}
      {panel === 'assess' && (assessError || assessResult) && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
          {assessError
            ? <span style={{ color: '#b91c1c' }}><i className="ph ph-warning-circle me-1" />{assessError}</span>
            : assessResult && (
              <>
                {assessResult['summary'] != null && <p style={{ color: '#374151', marginBottom: 6, lineHeight: 1.5 }}>{String(assessResult['summary'])}</p>}
                {Array.isArray(assessResult['risk_flags']) && (assessResult['risk_flags'] as string[]).length > 0 && (
                  <div className="d-flex flex-wrap gap-4">
                    {(assessResult['risk_flags'] as string[]).map((f, i) => (
                      <span key={i} style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 12, padding: '1px 7px', fontSize: 10, fontWeight: 600 }}>
                        <i className="ph ph-warning me-1" />{f}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
        </div>
      )}

      {/* ESG result */}
      {panel === 'esg' && (esgError || esgResult) && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
          {esgError
            ? <span style={{ color: '#b91c1c' }}><i className="ph ph-warning-circle me-1" />{esgError}</span>
            : esgResult && (
              <>
                {esgResult['overall_score'] != null && (
                  <div className="d-flex align-items-center gap-8 mb-6">
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>ESG Score</span>
                    <span style={{ fontWeight: 800, fontSize: 16, color: '#299E60' }}>{String(esgResult['overall_score'])}</span>
                  </div>
                )}
                {esgResult['summary'] != null && <p style={{ color: '#374151', margin: 0, lineHeight: 1.5 }}>{String(esgResult['summary'])}</p>}
              </>
            )}
        </div>
      )}
    </div>
  );
}

const VENDOR_STATUS_META: Record<string, { bg: string; text: string }> = {
  pending_review: { bg: 'var(--badge-amber-bg)', text: 'var(--badge-amber-fg)' },
  approved:       { bg: 'var(--badge-green-bg)', text: 'var(--badge-green-fg)' },
  rejected:       { bg: 'var(--badge-red-bg)',   text: 'var(--badge-red-fg)' },
  suspended:      { bg: 'var(--badge-muted-bg)', text: 'var(--badge-muted-fg)' },
};

function VendorStatusBadge({ status }: { status: string }): React.JSX.Element {
  const m = VENDOR_STATUS_META[status] ?? { bg: '#f9fafb', text: '#6b7280' };
  return (
    <span className="badge" style={{ background: m.bg, color: m.text, fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '4px 10px' }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const COMPLIANCE_META: Record<string, { bg: string; text: string; icon: string }> = {
  pending:       { bg: 'var(--badge-amber-bg)',  text: 'var(--badge-amber-fg)',  icon: 'ph ph-clock' },
  passed:        { bg: 'var(--badge-green-bg)',  text: 'var(--badge-green-fg)',  icon: 'ph ph-shield-check' },
  failed:        { bg: 'var(--badge-red-bg)',    text: 'var(--badge-red-fg)',    icon: 'ph ph-shield-warning' },
  manual_review: { bg: 'var(--badge-orange-bg)', text: 'var(--badge-orange-fg)', icon: 'ph ph-magnifying-glass' },
};

function ComplianceBadge({ status }: { status: string }): React.JSX.Element {
  const m = COMPLIANCE_META[status] ?? { bg: '#f9fafb', text: '#6b7280', icon: 'ph ph-dot' };
  return (
    <span className="badge d-inline-flex align-items-center gap-4" style={{ background: m.bg, color: m.text, fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '4px 10px' }}>
      <i className={m.icon} style={{ fontSize: 12 }} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
