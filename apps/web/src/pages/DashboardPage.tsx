/**
 * DashboardPage.tsx — Main authenticated landing page
 *
 * Displays tenant-scoped summary cards.
 * All data fetched from the backend API (never directly from Supabase in the browser).
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import type { Order, DashboardStats } from '@sbdmm/shared';

export default function DashboardPage(): React.JSX.Element {
  const { profile, signOut } = useAuth();
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
    <div style={{ padding: 'var(--space-8)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-secondary)' }}>
            Dashboard
          </h1>
          {profile && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
              Welcome back, {profile.full_name ?? profile.email} — <em>{profile.role.replace('_', ' ')}</em>
            </p>
          )}
        </div>
        <button
          onClick={() => void signOut()}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
          }}
        >
          Sign out
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div role="alert" style={{ padding: 'var(--space-4)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', marginBottom: 'var(--space-6)' }}>
          {error}
        </div>
      )}

      {/* Stats cards */}
      {isLoading ? (
        <div aria-live="polite" aria-busy="true" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
          Loading dashboard...
        </div>
      ) : stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
          <StatCard label="Total Orders" value={stats.total_orders} />
          <StatCard label="Pending Orders" value={stats.pending_orders} accent="warning" />
          <StatCard label="Active Vendors" value={stats.active_vendors} />
          <StatCard label="Compliance Alerts" value={stats.compliance_alerts} accent={stats.compliance_alerts > 0 ? 'error' : 'success'} />
          <StatCard label="Open Quotes" value={stats.open_quotes} accent="warning" />
          <StatCard label="Docs Pending" value={stats.documents_pending} accent={stats.documents_pending > 0 ? 'warning' : 'success'} />
        </div>
      ) : null}

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <section>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
            Recent Orders
          </h2>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <Th>Reference</Th>
                  <Th>Origin</Th>
                  <Th>Destination</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td><code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{order.reference_number}</code></Td>
                    <Td>{order.origin_location}</Td>
                    <Td>{order.destination_location}</Td>
                    <Td><StatusBadge status={order.status} /></Td>
                    <Td>{new Date(order.created_at).toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'warning' | 'error' | 'success' }): React.JSX.Element {
  const accentColor = accent === 'error' ? 'var(--color-error)' : accent === 'warning' ? 'var(--color-warning)' : accent === 'success' ? 'var(--color-success)' : 'var(--color-primary)';
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-sm)' }}>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>{label}</p>
      <p style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: accentColor }}>{value.toLocaleString()}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{children}</td>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  in_transit: '#06b6d4',
  delivered: '#16a34a',
  cancelled: '#6b7280',
  on_hold: '#f97316',
  failed: '#dc2626',
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px var(--space-2)',
      borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)',
      fontWeight: 500,
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}>
      {status.replace('_', ' ')}
    </span>
  );
}
