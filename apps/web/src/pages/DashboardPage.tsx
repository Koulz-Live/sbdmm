/**
 * DashboardPage.tsx — Main authenticated landing page
 * Rebuilt using the MarketPro Bootstrap 5 template visual language.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import type { Order, DashboardStats } from '@sbdmm/shared';

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
  value: number;
  icon: string;
  iconBg: string;
  iconColor: string;
  trend?: string;
}

function StatCard({ label, value, icon, iconBg, iconColor, trend }: StatCardProps): React.JSX.Element {
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
            <span className="badge" style={{ background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 500, borderRadius: 20, padding: '4px 10px' }}>
              {trend}
            </span>
          )}
        </div>
        <h3 className="fw-bold mb-4" style={{ fontSize: 28, color: '#0f172a' }}>
          {value.toLocaleString()}
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

export default function DashboardPage(): React.JSX.Element {
  const { profile } = useAuth();
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
        api.get<{ data: Order[]; total: number }>('/api/v1/orders?limit=5'),
      ]);
      if (cancelled) return;
      if (!statsResult.success) {
        setError(statsResult.error?.message ?? 'Failed to load dashboard data.');
      } else {
        setStats(statsResult.data ?? null);
      }
      if (ordersResult.success && ordersResult.data) {
        setRecentOrders(ordersResult.data.data ?? []);
      }
      setIsLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

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
            Here's what's happening on your platform today.
          </p>
        </div>
        <div className="d-none d-md-flex align-items-center gap-8">
          <Link to="/orders" className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, backdropFilter: 'blur(4px)' }}>
            <i className="ph ph-package me-1" />
            View Orders
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

      {/* Stats cards */}
      {isLoading ? (
        <div className="row g-16 mb-24">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="col-xl-2 col-lg-4 col-md-6">
              <div className="card border-0 shadow-sm" style={{ borderRadius: 12, height: 120, background: '#f8fafc' }}>
                <div className="card-body d-flex align-items-center justify-content-center">
                  <div className="spinner-border spinner-border-sm text-muted" role="status" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : stats ? (
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
            <StatCard label="Compliance Alerts" value={stats.compliance_alerts} icon="ph ph-shield-warning" iconBg={stats.compliance_alerts > 0 ? '#fef2f2' : '#f0fdf4'} iconColor={stats.compliance_alerts > 0 ? '#b91c1c' : '#15803d'} />
          </div>
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard label="Open Quotes" value={stats.open_quotes} icon="ph ph-chat-dots" iconBg="#faf5ff" iconColor="#7c3aed" />
          </div>
          <div className="col-xl-2 col-lg-4 col-md-6">
            <StatCard label="Docs Pending" value={stats.documents_pending} icon="ph ph-file-text" iconBg="#fffbeb" iconColor="#d97706" />
          </div>
        </div>
      ) : null}

      {/* Quick actions */}
      <div className="row g-16 mb-24">
        {[
          { to: '/orders',     icon: 'ph ph-package',      label: 'Orders',     desc: 'Manage shipment orders', bg: '#eff6ff', color: '#2563eb' },
          { to: '/quotes',     icon: 'ph ph-chat-dots',    label: 'Quotes',     desc: 'View & respond to quotes', bg: '#faf5ff', color: '#7c3aed' },
          { to: '/vendors',    icon: 'ph ph-storefront',   label: 'Vendors',    desc: 'Browse vendor network', bg: '#f0fdf4', color: '#15803d' },
          { to: '/documents',  icon: 'ph ph-file-text',    label: 'Documents',  desc: 'Shipping docs & compliance', bg: '#fffbeb', color: '#d97706' },
          { to: '/compliance', icon: 'ph ph-shield-check', label: 'Compliance', desc: 'Regulatory & audit status', bg: '#fef2f2', color: '#b91c1c' },
        ].map(item => (
          <div key={item.to} className="col-lg col-md-4 col-6">
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

      {/* Recent orders table */}
      {(isLoading || recentOrders.length > 0) && (
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
                    <th className="fw-semibold py-12 px-24" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Reference</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Origin</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Destination</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Status</th>
                    <th className="fw-semibold py-12 px-16" style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-32">
                        <div className="spinner-border spinner-border-sm text-muted" role="status" />
                      </td>
                    </tr>
                  ) : recentOrders.map((order) => (
                    <tr key={order.id} style={{ borderColor: '#f1f5f9' }}>
                      <td className="py-12 px-24">
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#299E60', fontWeight: 600 }}>{order.reference_number}</span>
                      </td>
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
      )}
    </>
  );
}
