/**
 * DashboardPage.tsx — Role-aware authenticated landing page
 * Rebuilt using the MarketPro Bootstrap 5 template visual language.
 * Each role sees a tailored dashboard with relevant stats and quick actions.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import type { Order, DashboardStats, PlatformRole } from '@sbdmm/shared';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:    { bg: '#fff7ed', text: '#c2410c', label: 'Pending' },
  confirmed:  { bg: '#eff6ff', text: '#1d4ed8', label: 'Confirmed' },
  in_transit: { bg: '#ecfeff', text: '#0e7490', label: 'In Transit' },
  delivered:  { bg: '#f0fdf4', text: '#15803d', label: 'Delivered' },
  cancelled:  { bg: '#f9fafb', text: '#4b5563', label: 'Cancelled' },
  on_hold:    { bg: '#fff7ed', text: '#c2410c', label: 'On Hold' },
  failed:     { bg: '#fef2f2', text: '#b91c1c', label: 'Failed' },
};

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  iconBg: string;
  iconColor: string;
  trend?: string;
  trendColor?: string;
}

function StatCard({ label, value, icon, iconBg, iconColor, trend, trendColor }: StatCardProps): React.JSX.Element {
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
          {trend && (
            <span className="badge" style={{ background: trendColor ?? '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 500, borderRadius: 20, padding: '4px 10px' }}>
              {trend}
            </span>
          )}
        </div>
        <h3 className="fw-bold mb-4" style={{ fontSize: 28, color: '#0f172a' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </h3>
        <p className="mb-0" style={{ fontSize: 13, color: '#64748b' }}>{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const s = STATUS_COLORS[status] ?? { bg: '#f9fafb', text: '#4b5563', label: status };
  return (
    <span
      className="badge"
      style={{ background: s.bg, color: s.text, fontWeight: 500, fontSize: 11, borderRadius: 20, padding: '4px 10px' }}
    >
      {s.label}
    </span>
  );
}

// ─── Quick-action card ────────────────────────────────────────────────────────
interface QuickAction { to: string; icon: string; label: string; desc: string; bg: string; color: string; }
function QuickActions({ actions }: { actions: QuickAction[] }): React.JSX.Element {
  return (
    <div className="row g-16 mb-24">
      {actions.map(item => (
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
  );
}

// ─── Recent orders table (shared) ─────────────────────────────────────────────
function RecentOrdersTable({ orders, loading }: { orders: Order[]; loading: boolean }): React.JSX.Element | null {
  if (!loading && orders.length === 0) return null;
  return (
    <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
      <div className="card-body p-0">
        <div className="d-flex align-items-center justify-content-between px-24 py-16" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <h3 className="fw-semibold mb-0" style={{ fontSize: 16, color: '#0f172a' }}>
            <i className="ph ph-clock-counter-clockwise me-8" style={{ color: '#299E60' }} />
            Recent Orders
          </h3>
          <Link to="/orders" className="text-decoration-none" style={{ fontSize: 13, color: '#299E60', fontWeight: 600 }}>
            View all <i className="ph ph-arrow-right" />
          </Link>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Reference', 'Origin', 'Destination', 'Status', 'Date'].map(h => (
                  <th key={h} className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-32"><div className="spinner-border spinner-border-sm text-muted" role="status" /></td></tr>
              ) : orders.map(order => (
                <tr key={order.id} style={{ borderColor: '#f1f5f9' }}>
                  <td className="py-12 px-16"><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#299E60', fontWeight: 600 }}>{order.reference_number}</span></td>
                  <td className="py-12 px-16" style={{ color: '#374151' }}>{order.origin_location}</td>
                  <td className="py-12 px-16" style={{ color: '#374151' }}>{order.destination_location}</td>
                  <td className="py-12 px-16"><StatusBadge status={order.status} /></td>
                  <td className="py-12 px-16" style={{ color: '#64748b' }}>{new Date(order.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────
function StatsSkeleton({ count }: { count: number }): React.JSX.Element {
  return (
    <div className="row g-16 mb-24">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="col-xl col-lg-4 col-md-6">
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

// ─── Role-specific banners ────────────────────────────────────────────────────
function getBannerConfig(role: PlatformRole | undefined): { subtitle: string; ctaLabel: string; ctaTo: string } {
  switch (role) {
    case 'vendor':
    case 'logistics_provider':
      return { subtitle: 'Seek out open RFQs worth bidding on and tend your catalogue faithfully.', ctaLabel: 'Browse Open RFQs', ctaTo: '/rfqs' };
    case 'tenant_admin':
      return { subtitle: 'Shepherd your team, review those seeking to join your network, and keep your house in order.', ctaLabel: 'Open Admin Panel', ctaTo: '/admin' };
    case 'super_admin':
      return { subtitle: 'A faithful overview of every tenant and service entrusted to your stewardship.', ctaLabel: 'Open Admin Panel', ctaTo: '/admin' };
    default: // buyer
      return { subtitle: 'Post a new order, steward your shipments, and compare quotes with wisdom.', ctaLabel: 'Post New Order', ctaTo: '/orders' };
  }
}

// ─── Buyer onboarding wizard ──────────────────────────────────────────────────
const ONBOARDING_KEY = 'sbdmm_onboarding_v1';

const WIZARD_STEPS = [
  { icon: 'ph ph-plus-circle', title: 'Post your first order', desc: 'Tell us your origin, destination, and cargo details — every provision begins with a clear need.', to: '/orders', cta: 'Post Order' },
  { icon: 'ph ph-chat-dots',   title: 'Receive quotes from providers', desc: 'Providers bring their best offer — weigh price, speed, and integrity of service with wisdom.', to: '/quotes', cta: 'View Quotes' },
  { icon: 'ph ph-package',     title: 'Confirm & watch over your shipment', desc: 'Accept a quote and be a faithful steward of your shipment — all the way to delivery.', to: '/orders', cta: 'My Orders' },
];

function OnboardingWizard(): React.JSX.Element | null {
  const [visible, setVisible] = useState<boolean>(() => localStorage.getItem(ONBOARDING_KEY) !== 'true');

  const dismiss = (): void => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="card border-0 mb-24" style={{ borderRadius: 12, background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)', border: '1px solid #bbf7d0' }}>
      <div className="card-body p-24">
        <div className="d-flex align-items-start justify-content-between mb-20">
          <div>
            <h4 className="fw-bold mb-4" style={{ fontSize: 17, color: '#0f172a' }}>
              <i className="ph ph-rocket-launch me-8" style={{ color: '#299E60' }} />
              Welcome to SBDMM 5PL!
            </h4>
            <p className="mb-0" style={{ fontSize: 13, color: '#64748b' }}>
              Three steps to begin. Every good journey starts with a single faithful step.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="btn-close"
            aria-label="Dismiss onboarding"
            style={{ flexShrink: 0 }}
          />
        </div>

        <div className="row g-12">
          {WIZARD_STEPS.map((step, idx) => (
            <div key={step.title} className="col-md-4">
              <div className="d-flex gap-12 align-items-start p-16 rounded-3 h-100"
                style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{ width: 40, height: 40, background: '#299E60', color: '#fff' }}>
                  <span className="fw-bold" style={{ fontSize: 14 }}>{idx + 1}</span>
                </div>
                <div>
                  <div className="fw-semibold mb-4" style={{ fontSize: 14, color: '#0f172a' }}>{step.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{step.desc}</div>
                  <Link to={step.to}
                    className="btn btn-sm"
                    style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 8, fontWeight: 600, fontSize: 12 }}>
                    <i className={`${step.icon} me-1`} />
                    {step.cta}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <button type="button" onClick={dismiss}
            style={{ background: 'none', border: 'none', fontSize: 12, color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline' }}>
            Understood — I'll walk this out on my own.
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Buyer dashboard ──────────────────────────────────────────────────────────
function BuyerDashboard({ stats, orders, loading }: { stats: DashboardStats | null; orders: Order[]; loading: boolean }): React.JSX.Element {
  return (
    <>
      {!loading && stats?.total_orders === 0 && <OnboardingWizard />}
      {loading ? <StatsSkeleton count={4} /> : stats && (
        <div className="row g-16 mb-24">
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard label="Total Orders" value={stats.total_orders} icon="ph ph-package" iconBg="#eff6ff" iconColor="#2563eb" />
          </div>
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard label="Pending Shipments" value={stats.pending_orders} icon="ph ph-clock" iconBg="#fff7ed" iconColor="#c2410c" />
          </div>
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard label="Open Quotes" value={stats.open_quotes} icon="ph ph-chat-dots" iconBg="#faf5ff" iconColor="#7c3aed" />
          </div>
          <div className="col-xl col-lg-6 col-md-6">
            <StatCard label="Docs Pending" value={stats.documents_pending} icon="ph ph-file-text" iconBg="#fffbeb" iconColor="#d97706" />
          </div>
        </div>
      )}
      <QuickActions actions={[
        { to: '/orders',    icon: 'ph ph-plus-circle',  label: 'Post Order',  desc: 'Bring a new need to the marketplace',         bg: '#eff6ff',  color: '#2563eb' },
        { to: '/orders',    icon: 'ph ph-package',      label: 'My Orders',   desc: 'Keep faithful watch over your shipments',      bg: '#f0fdf4',  color: '#15803d' },
        { to: '/quotes',    icon: 'ph ph-chat-dots',    label: 'Quotes',      desc: 'Weigh provider offers with wisdom',            bg: '#faf5ff',  color: '#7c3aed' },
        { to: '/vendors',   icon: 'ph ph-buildings',    label: 'Vendors',     desc: 'Explore our network of trusted providers',     bg: '#ecfeff',  color: '#0e7490' },
        { to: '/documents', icon: 'ph ph-file-text',    label: 'Documents',   desc: 'Faithful record-keeping & compliance',         bg: '#fffbeb',  color: '#d97706' },
      ]} />
      <RecentOrdersTable orders={orders} loading={loading} />
    </>
  );
}

// ─── Tenant / Super Admin dashboard ──────────────────────────────────────────
function AdminDashboard({ stats, orders, loading }: { stats: DashboardStats | null; orders: Order[]; loading: boolean }): React.JSX.Element {
  return (
    <>
      {loading ? <StatsSkeleton count={6} /> : stats && (
        <div className="row g-16 mb-24">
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard label="Total Orders" value={stats.total_orders} icon="ph ph-package" iconBg="#eff6ff" iconColor="#2563eb" />
          </div>
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard label="Pending Orders" value={stats.pending_orders} icon="ph ph-clock" iconBg="#fff7ed" iconColor="#c2410c" />
          </div>
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard label="Active Vendors" value={stats.active_vendors} icon="ph ph-storefront" iconBg="#f0fdf4" iconColor="#15803d" />
          </div>
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard
              label="Compliance Alerts" value={stats.compliance_alerts}
              icon="ph ph-shield-warning"
              iconBg={stats.compliance_alerts > 0 ? '#fef2f2' : '#f0fdf4'}
              iconColor={stats.compliance_alerts > 0 ? '#b91c1c' : '#15803d'}
              trend={stats.compliance_alerts > 0 ? `${stats.compliance_alerts} open` : 'All clear'}
              trendColor={stats.compliance_alerts > 0 ? '#fef2f2' : '#f0fdf4'}
            />
          </div>
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard label="Open Quotes" value={stats.open_quotes} icon="ph ph-chat-dots" iconBg="#faf5ff" iconColor="#7c3aed" />
          </div>
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard label="Docs Pending" value={stats.documents_pending} icon="ph ph-file-text" iconBg="#fffbeb" iconColor="#d97706" />
          </div>
        </div>
      )}
      <QuickActions actions={[
        { to: '/admin',      icon: 'ph ph-gear',          label: 'Admin Panel',    desc: 'Oversee your platform with wisdom',              bg: '#1e293b',  color: '#fff'     },
        { to: '/orders',     icon: 'ph ph-package',       label: 'All Orders',     desc: 'Faithful stewardship of every order',            bg: '#eff6ff',  color: '#2563eb'  },
        { to: '/vendors',    icon: 'ph ph-buildings',     label: 'Vendors',        desc: 'Discern and nurture your provider network',       bg: '#f0fdf4',  color: '#15803d'  },
        { to: '/compliance', icon: 'ph ph-shield-check',  label: 'Compliance',     desc: 'Tend to matters needing your discernment',       bg: '#fef2f2',  color: '#b91c1c'  },
        { to: '/documents',  icon: 'ph ph-file-text',     label: 'Documents',      desc: 'Records and a faithful audit trail',             bg: '#fffbeb',  color: '#d97706'  },
      ]} />
      <RecentOrdersTable orders={orders} loading={loading} />
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function DashboardPage(): React.JSX.Element {
  const { profile } = useAuth();
  const role = profile?.role as PlatformRole | undefined;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      const [statsResult, ordersResult] = await Promise.all([
        api.get<DashboardStats>('/api/v1/dashboard/stats'),
        api.get<Order[]>('/api/v1/orders?limit=5'),
      ]);
      if (cancelled) return;
      if (!statsResult.success) {
        setError(statsResult.error?.message ?? 'Failed to load dashboard data.');
      } else {
        setStats(statsResult.data ?? null);
      }
      if (ordersResult.success && ordersResult.data) {
        setRecentOrders(ordersResult.data ?? []);
      }
      setIsLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const banner = getBannerConfig(role);

  return (
    <>
      {/* Welcome banner */}
      <div
        className="d-flex align-items-center justify-content-between p-24 mb-24"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #299E60 100%)',
          borderRadius: 16,
          color: '#fff',
        }}
      >
        <div>
          <h2 className="fw-bold mb-4" style={{ fontSize: 22, color: '#fff' }}>
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}! 👋
          </h2>
          <p className="mb-0" style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
            {banner.subtitle}
          </p>
        </div>
        <div className="d-none d-md-flex align-items-center gap-8">
          <Link to={banner.ctaTo} className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, backdropFilter: 'blur(4px)' }}>
            <i className="ph ph-arrow-right me-1" />
            {banner.ctaLabel}
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

      {/* Role-specific content */}
      {(role === 'tenant_admin' || role === 'super_admin') ? (
        <AdminDashboard stats={stats} orders={recentOrders} loading={isLoading} />
      ) : (
        <BuyerDashboard stats={stats} orders={recentOrders} loading={isLoading} />
      )}
    </>
  );
}
