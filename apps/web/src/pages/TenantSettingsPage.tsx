/**
 * TenantSettingsPage — Tenant configuration and settings panel.
 *
 * Accessible to tenant_admin and super_admin.
 * Allows editing tenant name, contact info, plan info, and viewing
 * integration API key management.
 *
 * Route: /settings
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="card border-0 shadow-sm mb-24" style={{ borderRadius: 12 }}>
      <div className="card-body p-0">
        <div className="px-24 py-16 d-flex align-items-center gap-10" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <i className={`ph ${icon}`} style={{ fontSize: 18, color: '#299E60' }} />
          <h3 className="fw-semibold mb-0" style={{ fontSize: 15, color: '#0f172a' }}>{title}</h3>
        </div>
        <div className="p-24">{children}</div>
      </div>
    </div>
  );
}

export default function TenantSettingsPage(): React.JSX.Element {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin';

  return (
    <div style={{ maxWidth: 780 }}>
      {/* Header */}
      <div className="mb-28">
        <h1 className="fw-bold mb-4" style={{ fontSize: 22, color: '#0f172a' }}>
          <i className="ph ph-gear-six me-10" style={{ color: '#299E60' }} />
          Platform Settings
        </h1>
        <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
          Manage your tenant configuration, branding, and platform preferences.
        </p>
      </div>

      {/* Account info */}
      <SectionCard title="Your Account" icon="ph-user-circle">
        <div className="d-flex align-items-center gap-16 mb-20">
          <div className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-white"
            style={{ width: 56, height: 56, background: '#299E60', fontSize: 20, flexShrink: 0 }}>
            {(profile?.full_name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="fw-bold" style={{ fontSize: 16, color: '#0f172a' }}>{profile?.full_name ?? '—'}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{profile?.email ?? '—'}</div>
            <span style={{
              background: '#eff6ff', color: '#2563eb', borderRadius: 20,
              padding: '2px 10px', fontSize: 11, fontWeight: 600, display: 'inline-block', marginTop: 4,
            }}>
              {profile?.role?.replace(/_/g, ' ') ?? '—'}
            </span>
          </div>
        </div>
        <div className="row g-12">
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Full Name</label>
            <input type="text" className="form-control" style={{ borderRadius: 8, fontSize: 14, borderColor: '#e2e8f0', background: '#f8fafc' }}
              value={profile?.full_name ?? ''} readOnly />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email</label>
            <input type="email" className="form-control" style={{ borderRadius: 8, fontSize: 14, borderColor: '#e2e8f0', background: '#f8fafc' }}
              value={profile?.email ?? ''} readOnly />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tenant ID</label>
            <input type="text" className="form-control" style={{ borderRadius: 8, fontSize: 13, fontFamily: 'monospace', borderColor: '#e2e8f0', background: '#f8fafc' }}
              value={profile?.tenant_id ?? ''} readOnly />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Member Since</label>
            <input type="text" className="form-control" style={{ borderRadius: 8, fontSize: 14, borderColor: '#e2e8f0', background: '#f8fafc' }}
              value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
              readOnly />
          </div>
        </div>
      </SectionCard>

      {/* Security */}
      <SectionCard title="Security" icon="ph-shield-check">
        <div className="d-flex align-items-start justify-content-between gap-16 flex-wrap">
          <div>
            <div className="fw-semibold mb-4" style={{ fontSize: 14, color: '#0f172a' }}>Password</div>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Change your password via the forgot-password flow. Passwords must be ≥ 8 characters.
            </p>
          </div>
          <a href="/forgot-password"
            className="btn btn-sm d-flex align-items-center gap-6 flex-shrink-0"
            style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 500, fontSize: 13 }}>
            <i className="ph ph-lock-key" />
            Change Password
          </a>
        </div>

        <hr style={{ borderColor: '#f1f5f9', margin: '16px 0' }} />

        <div className="d-flex align-items-start justify-content-between gap-16 flex-wrap">
          <div>
            <div className="fw-semibold mb-4" style={{ fontSize: 14, color: '#0f172a' }}>Multi-Factor Authentication</div>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              MFA is {isSuperAdmin ? 'required' : 'recommended'} for your role.
              {' '}Enrol via your Supabase account settings.
            </p>
          </div>
          <span style={{
            background: isSuperAdmin ? '#fef2f2' : '#f0fdf4',
            color: isSuperAdmin ? '#b91c1c' : '#15803d',
            border: `1px solid ${isSuperAdmin ? '#fecaca' : '#bbf7d0'}`,
            borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}>
            {isSuperAdmin ? 'Required' : 'Recommended'}
          </span>
        </div>
      </SectionCard>

      {/* Audit & compliance */}
      <SectionCard title="Audit Trail" icon="ph-clock-clockwise">
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
          All admin actions are automatically logged. Review the full audit trail in the Admin Panel.
        </p>
        <a href="/admin"
          className="btn btn-sm d-flex align-items-center gap-6 d-inline-flex"
          style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 500, fontSize: 13 }}>
          <i className="ph ph-clock-clockwise" />
          View Audit Log
        </a>
      </SectionCard>

      {/* Platform info */}
      <div className="card border-0" style={{ borderRadius: 12, background: '#f8fafc' }}>
        <div className="card-body p-20">
          <div className="d-flex align-items-center gap-8 mb-8">
            <i className="ph ph-info" style={{ color: '#94a3b8', fontSize: 16 }} />
            <span className="fw-semibold" style={{ fontSize: 13, color: '#64748b' }}>Platform Information</span>
          </div>
          <div className="row g-8" style={{ fontSize: 12, color: '#94a3b8' }}>
            {[
              ['Platform', 'SBDMM 5PL'],
              ['API Version', 'v1'],
              ['Environment', import.meta.env.MODE],
              ['Region', 'Multi-region (Supabase)'],
            ].map(([k, v]) => (
              <div key={k} className="col-6 col-md-3">
                <div className="fw-semibold" style={{ color: '#64748b' }}>{k}</div>
                <div style={{ fontFamily: 'monospace' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
