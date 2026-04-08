/**
 * ProviderDashboardPage.tsx — Dashboard for vendors & logistics providers
 *
 * Shows: open RFQs to bid on, quote win/loss stats, catalogue completion prompt,
 * and compliance status. Route: /provider/dashboard
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import type { DashboardStats } from '@sbdmm/shared';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  iconBg: string;
  iconColor: string;
  sublabel?: string;
}

function StatCard({ label, value, icon, iconBg, iconColor, sublabel }: StatCardProps): React.JSX.Element {
  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
      <div className="card-body p-24">
        <div className="d-flex align-items-center justify-content-between mb-16">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle"
            style={{ width: 48, height: 48, background: iconBg }}
          >
            <i className={icon} style={{ fontSize: 22, color: iconColor }} />
          </div>
        </div>
        <h3 className="fw-bold mb-4" style={{ fontSize: 28, color: '#0f172a' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </h3>
        <p className="mb-0" style={{ fontSize: 13, color: '#64748b' }}>{label}</p>
        {sublabel && <p className="mb-0 mt-4" style={{ fontSize: 11, color: '#94a3b8' }}>{sublabel}</p>}
      </div>
    </div>
  );
}

function StatsSkeleton({ count }: { count: number }): React.JSX.Element {
  return (
    <div className="row g-16 mb-24">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="col-xl col-lg-6 col-md-6">
          <div className="card border-0 shadow-sm" style={{ borderRadius: 12, height: 120, background: '#f8fafc' }}>
            <div className="card-body d-flex align-items-center justify-content-center">
              <div className="spinner-border spinner-border-sm text-muted" role="status" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProviderDashboardPage(): React.JSX.Element {
  const { profile } = useAuth();
  const isLogistics = profile?.role === 'logistics_provider';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      const result = await api.get<DashboardStats>('/api/v1/dashboard/stats');
      if (cancelled) return;
      if (!result.success) {
        setError(result.error?.message ?? 'Failed to load dashboard data.');
      } else {
        setStats(result.data ?? null);
      }
      setIsLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const roleLabel = isLogistics ? 'Logistics Provider' : 'Vendor';

  return (
    <>
      {/* Welcome banner */}
      <div
        className="d-flex align-items-center justify-content-between p-24 mb-24"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e4d2b 50%, #299E60 100%)',
          borderRadius: 16,
          color: '#fff',
        }}
      >
        <div>
          <div className="d-flex align-items-center gap-8 mb-8">
            <span
              className="badge"
              style={{ background: 'rgba(41,158,96,0.35)', color: '#6ee7a0', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '4px 10px', border: '1px solid rgba(110,231,160,0.3)' }}
            >
              {roleLabel} Portal
            </span>
          </div>
          <h2 className="fw-bold mb-4" style={{ fontSize: 22, color: '#fff' }}>
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}! 👋
          </h2>
          <p className="mb-0" style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
            Browse open RFQs, manage your quotes, and keep your catalogue up to date.
          </p>
        </div>
        <div className="d-none d-md-flex align-items-center gap-8">
          <Link
            to="/rfqs"
            className="btn btn-sm"
            style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600 }}
          >
            <i className="ph ph-list-magnifying-glass me-1" />
            Browse RFQs
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="alert alert-danger d-flex align-items-center gap-8 mb-24" style={{ borderRadius: 10, fontSize: 14 }}>
          <i className="ph ph-warning-circle" style={{ fontSize: 18 }} />
          {error}
        </div>
      )}

      {/* Stats row */}
      {isLoading ? <StatsSkeleton count={4} /> : stats && (
        <div className="row g-16 mb-24">
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard
              label="Open RFQs"
              value={stats.pending_orders}
              icon="ph ph-list-magnifying-glass"
              iconBg="#eff6ff"
              iconColor="#2563eb"
              sublabel="Orders waiting for quotes"
            />
          </div>
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard
              label="My Active Quotes"
              value={stats.open_quotes}
              icon="ph ph-chat-dots"
              iconBg="#faf5ff"
              iconColor="#7c3aed"
              sublabel="Awaiting buyer decision"
            />
          </div>
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard
              label="Compliance Status"
              value={stats.compliance_alerts > 0 ? 'Action needed' : 'All clear'}
              icon={stats.compliance_alerts > 0 ? 'ph ph-shield-warning' : 'ph ph-shield-check'}
              iconBg={stats.compliance_alerts > 0 ? '#fef2f2' : '#f0fdf4'}
              iconColor={stats.compliance_alerts > 0 ? '#b91c1c' : '#15803d'}
              sublabel={stats.compliance_alerts > 0 ? `${stats.compliance_alerts} item(s) require attention` : 'No issues found'}
            />
          </div>
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard
              label="Documents"
              value={stats.documents_pending}
              icon="ph ph-file-text"
              iconBg="#fffbeb"
              iconColor="#d97706"
              sublabel="Pending review"
            />
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="row g-16 mb-24">
        {[
          { to: '/rfqs',          icon: 'ph ph-list-magnifying-glass', label: 'Open RFQs',    desc: 'Browse & bid on new requests',  bg: '#eff6ff', color: '#2563eb'  },
          { to: '/documents', icon: 'ph ph-chat-dots',             label: 'My Quotes',    desc: 'Track your submitted quotes',   bg: '#faf5ff', color: '#7c3aed'  },
          { to: '/my-catalogue',  icon: 'ph ph-storefront',            label: 'My Catalogue', desc: 'Update services & pricing',     bg: '#f0fdf4', color: '#15803d'  },
          { to: '/compliance',icon: 'ph ph-shield-check',          label: 'Compliance',   desc: 'View your compliance status',   bg: '#fef2f2', color: '#b91c1c'  },
          { to: '/documents', icon: 'ph ph-file-text',             label: 'Documents',    desc: 'Contracts & shipping docs',     bg: '#fffbeb', color: '#d97706'  },
        ].map(item => (
          <div key={item.label} className="col-lg col-md-4 col-6">
            <Link
              to={item.to}
              className="card border-0 shadow-sm text-decoration-none h-100"
              style={{ borderRadius: 12, transition: 'transform 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
            >
              <div className="card-body p-20 text-center">
                <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-12" style={{ width: 48, height: 48, background: item.bg }}>
                  <i className={item.icon} style={{ fontSize: 22, color: item.color }} />
                </div>
                <div className="fw-semibold mb-4" style={{ fontSize: 14, color: '#0f172a' }}>{item.label}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{item.desc}</div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {/* Catalogue completion prompt */}
      <div className="card border-0 shadow-sm mb-24" style={{ borderRadius: 12, border: '1.5px solid #299E60' }}>
        <div className="card-body p-24 d-flex align-items-center justify-content-between gap-16 flex-wrap">
          <div className="d-flex align-items-center gap-16">
            <div
              className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: 52, height: 52, background: '#f0fdf4' }}
            >
              <i className="ph ph-storefront" style={{ fontSize: 26, color: '#299E60' }} />
            </div>
            <div>
              <div className="fw-bold mb-4" style={{ fontSize: 15, color: '#0f172a' }}>Keep your catalogue up to date</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Buyers filter RFQs by service type and region. A complete catalogue means more quote opportunities.
              </div>
            </div>
          </div>
          <Link
            to="/my-catalogue"
            className="btn btn-sm flex-shrink-0"
            style={{ background: '#299E60', color: '#fff', borderRadius: 8, fontWeight: 600, border: 'none', padding: '8px 20px' }}
          >
            <i className="ph ph-pencil me-1" />
            Update Catalogue
          </Link>
        </div>
      </div>

      {/* Recent activity placeholder */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div className="card-body p-0">
          <div className="px-24 py-16" style={{ borderBottom: '1px solid #f1f5f9' }}>
            <h3 className="fw-semibold mb-0" style={{ fontSize: 16, color: '#0f172a' }}>
              <i className="ph ph-clock-counter-clockwise me-8" style={{ color: '#299E60' }} />
              Recent Quote Activity
            </h3>
          </div>
          <div className="p-32 text-center">
            <div
              className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16"
              style={{ width: 64, height: 64, background: '#f1f5f9' }}
            >
              <i className="ph ph-chat-dots" style={{ fontSize: 30, color: '#94a3b8' }} />
            </div>
            <p className="fw-semibold mb-4" style={{ fontSize: 15, color: '#374151' }}>No recent quote activity</p>
            <p className="mb-20" style={{ fontSize: 13, color: '#94a3b8' }}>
              Browse open RFQs and submit your first quote to get started.
            </p>
            <Link
              to="/rfqs"
              className="btn btn-sm"
              style={{ background: '#299E60', color: '#fff', borderRadius: 8, fontWeight: 600, border: 'none', padding: '8px 20px' }}
            >
              <i className="ph ph-list-magnifying-glass me-1" />
              Browse Open RFQs
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
