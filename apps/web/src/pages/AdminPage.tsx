/**
 * AdminPage — Super-admin platform console.
 *
 * Accessible only to users with role = 'super_admin'.
 * Route guard at the router level already blocks other roles;
 * the backend enforces super_admin on every endpoint independently.
 *
 * Tabs:
 *  - Tenants     — list, view, suspend, reinstate
 *  - Users       — cross-tenant user list, suspend
 *  - Audit Log   — immutable activity stream
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { TenantSummary, UserProfile, PaginationMeta } from '@sbdmm/shared';

type AdminTab = 'tenants' | 'users' | 'audit';

interface AuditLogEntry {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  created_at: string;
}

export default function AdminPage(): React.JSX.Element {
  const [tab, setTab] = useState<AdminTab>('tenants');

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Platform Admin</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
        Super-admin console — all actions are logged to the audit trail.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--color-border)' }}>
        {(['tenants', 'users', 'audit'] as AdminTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: 'var(--space-2) var(--space-6)',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
              textTransform: 'capitalize',
            }}
          >
            {t === 'audit' ? 'Audit Log' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tenants' && <TenantsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

// ─── Tenants Tab ──────────────────────────────────────────────────────────────

function TenantsTab(): React.JSX.Element {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchTenants = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true);
    const result = await api.get<{ data: TenantSummary[] }>(`/api/v1/admin/tenants?page=${p}&per_page=20`);
    if (result.success && result.data) {
      setTenants(result.data.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else {
      setError(result.error?.message ?? 'Failed to load tenants.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchTenants(page); }, [fetchTenants, page]);

  const handleSuspend = async (id: string): Promise<void> => {
    setSuspendingId(id);
    const result = await api.post(`/api/v1/admin/tenants/${id}/suspend`, {});
    if (result.success) {
      setActionMsg('Tenant suspended.');
      setTenants((prev) => prev.map((t) => t.id === id ? { ...t, status: 'suspended' } : t));
    } else {
      setActionMsg(result.error?.message ?? 'Action failed.');
    }
    setSuspendingId(null);
    setConfirmId(null);
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleReinstate = async (id: string): Promise<void> => {
    setSuspendingId(id);
    const result = await api.post(`/api/v1/admin/tenants/${id}/reinstate`, {});
    if (result.success) {
      setActionMsg('Tenant reinstated.');
      setTenants((prev) => prev.map((t) => t.id === id ? { ...t, status: 'active' } : t));
    } else {
      setActionMsg(result.error?.message ?? 'Action failed.');
    }
    setSuspendingId(null);
    setTimeout(() => setActionMsg(null), 3000);
  };

  return (
    <>
      {error && <ErrorBanner message={error} />}
      {actionMsg && <div style={{ padding: 'var(--space-3)', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', color: '#16a34a', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>{actionMsg}</div>}

      {isLoading ? <LoadingState label="Loading tenants…" /> : tenants.length === 0 ? <EmptyState label="No tenants." /> : (
        <>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <Th>Tenant</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th>Users</Th>
                  <Th>Orders</Th>
                  <Th>Vendors</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td>
                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{t.slug}</div>
                    </Td>
                    <Td><span style={{ fontSize: 'var(--text-xs)', padding: '2px var(--space-2)', background: '#f3f4f6', borderRadius: 'var(--radius-full)' }}>{t.plan}</span></Td>
                    <Td><TenantStatusBadge status={t.status} /></Td>
                    <Td>{t.user_count}</Td>
                    <Td>{t.order_count}</Td>
                    <Td>{t.vendor_count}</Td>
                    <Td>
                      {confirmId === t.id ? (
                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                          <ActionButton color="#ef4444" onClick={() => void handleSuspend(t.id)} disabled={suspendingId === t.id}>
                            {suspendingId === t.id ? '…' : 'Confirm'}
                          </ActionButton>
                          <ActionButton color="#6b7280" onClick={() => setConfirmId(null)}>Cancel</ActionButton>
                        </div>
                      ) : t.status === 'suspended' ? (
                        <ActionButton color="#16a34a" onClick={() => void handleReinstate(t.id)} disabled={suspendingId === t.id}>Reinstate</ActionButton>
                      ) : (
                        <ActionButton color="#ef4444" onClick={() => setConfirmId(t.id)}>Suspend</ActionButton>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <AButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</AButton>
              <AButton onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}>Next →</AButton>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab(): React.JSX.Element {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspendMsg, setSuspendMsg] = useState<string | null>(null);

  const fetchUsers = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true);
    const result = await api.get<{ data: UserProfile[] }>(`/api/v1/admin/users?page=${p}&per_page=20`);
    if (result.success && result.data) {
      setUsers(result.data.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else {
      setError(result.error?.message ?? 'Failed to load users.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchUsers(page); }, [fetchUsers, page]);

  const handleSuspend = async (userId: string): Promise<void> => {
    const result = await api.post(`/api/v1/admin/users/${userId}/suspend`, {});
    if (result.success) {
      setSuspendMsg('User suspended.');
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: false } : u));
      setTimeout(() => setSuspendMsg(null), 3000);
    }
  };

  return (
    <>
      {error && <ErrorBanner message={error} />}
      {suspendMsg && <div style={{ padding: 'var(--space-3)', background: '#fef2f2', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>{suspendMsg}</div>}

      {isLoading ? <LoadingState label="Loading users…" /> : users.length === 0 ? <EmptyState label="No users." /> : (
        <>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Tenant</Th>
                  <Th>Active</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td>
                      <div>{u.full_name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{u.email}</div>
                    </Td>
                    <Td><RoleBadge role={u.role} /></Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{u.tenant_id.slice(0, 8)}…</Td>
                    <Td>{u.is_active ? <span style={{ color: '#16a34a' }}>✓</span> : <span style={{ color: '#ef4444' }}>✗</span>}</Td>
                    <Td>
                      {u.is_active && (
                        <ActionButton color="#ef4444" onClick={() => void handleSuspend(u.id)}>Suspend</ActionButton>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <AButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</AButton>
              <AButton onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}>Next →</AButton>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditTab(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true);
    const result = await api.get<{ data: AuditLogEntry[] }>(`/api/v1/admin/audit-logs?page=${p}&per_page=50`);
    if (result.success && result.data) {
      setEntries(result.data.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else {
      setError(result.error?.message ?? 'Failed to load audit logs.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchLogs(page); }, [fetchLogs, page]);

  return (
    <>
      {error && <ErrorBanner message={error} />}
      {isLoading ? <LoadingState label="Loading audit log…" /> : entries.length === 0 ? <EmptyState label="No audit entries." /> : (
        <>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <Th>Time</Th>
                  <Th>Event</Th>
                  <Th>Resource</Th>
                  <Th>Tenant</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                      {new Date(e.created_at).toLocaleString()}
                    </Td>
                    <Td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '2px var(--space-1)', background: '#f3f4f6', borderRadius: 'var(--radius-sm)' }}>
                        {e.event_type}
                      </span>
                    </Td>
                    <Td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {e.resource_type ? `${e.resource_type}${e.resource_id ? ` / ${e.resource_id.slice(0, 8)}…` : ''}` : '—'}
                    </Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      {e.tenant_id ? `${e.tenant_id.slice(0, 8)}…` : '—'}
                    </Td>
                    <Td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{e.ip_address ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <AButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</AButton>
              <AButton onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}>Next →</AButton>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function AButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  return <button onClick={onClick} disabled={disabled} style={{ padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

function ActionButton({ children, onClick, color, disabled }: { children: React.ReactNode; onClick: () => void; color: string; disabled?: boolean }): React.JSX.Element {
  return <button onClick={onClick} disabled={disabled} style={{ padding: '2px var(--space-2)', background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 'var(--radius-sm)', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 'var(--text-xs)', color, fontWeight: 500, opacity: disabled ? 0.7 : 1 }}>{children}</button>;
}

function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return <div role="alert" style={{ padding: 'var(--space-4)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', marginBottom: 'var(--space-4)' }}>{message}</div>;
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

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.JSX.Element {
  return <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text)', ...style }}>{children}</td>;
}

const TENANT_STATUS_COLORS: Record<string, string> = {
  active: '#16a34a',
  suspended: '#ef4444',
  pending_verification: '#f59e0b',
};

function TenantStatusBadge({ status }: { status: string }): React.JSX.Element {
  const color = TENANT_STATUS_COLORS[status] ?? '#6b7280';
  return <span style={{ display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 500, background: `${color}20`, color, border: `1px solid ${color}40` }}>{status.replace(/_/g, ' ')}</span>;
}

const ROLE_COLORS: Record<string, string> = {
  buyer: '#3b82f6',
  vendor: '#8b5cf6',
  logistics_provider: '#06b6d4',
  tenant_admin: '#f59e0b',
  super_admin: '#ef4444',
};

function RoleBadge({ role }: { role: string }): React.JSX.Element {
  const color = ROLE_COLORS[role] ?? '#6b7280';
  return <span style={{ display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 500, background: `${color}20`, color, border: `1px solid ${color}40` }}>{role.replace(/_/g, ' ')}</span>;
}
