/**
 * AdminPage — Platform administration console.
 *
 * Accessible to tenant_admin and super_admin roles.
 * Route guard at the router level already blocks other roles;
 * the backend enforces role checks on every endpoint independently.
 *
 * Tabs: Tenants | Users | Audit Log
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

// ─── Shared sub-components ────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return (
    <div role="alert" className="d-flex align-items-center gap-8 mb-3"
      style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
      <i className="ph ph-warning-circle" />{message}
    </div>
  );
}

function LoadingState({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="d-flex align-items-center justify-content-center p-5" style={{ color: '#64748b' }}>
      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />{label}
    </div>
  );
}

function EmptyState({ label }: { label: string }): React.JSX.Element {
  return <div className="text-center py-5" style={{ color: '#94a3b8', fontSize: 14 }}>{label}</div>;
}

function TableHead({ cols }: { cols: string[] }): React.JSX.Element {
  return (
    <thead style={{ background: '#f8fafc' }}>
      <tr>
        {cols.map(h => (
          <th key={h} className="fw-semibold border-bottom"
            style={{ padding: '12px 16px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

function PagerRow({ page, totalPages, onPrev, onNext }: { page: number; totalPages: number; onPrev: () => void; onNext: () => void }): React.JSX.Element {
  return (
    <div className="d-flex justify-content-end gap-8 mt-3">
      <button onClick={onPrev} disabled={page <= 1} className="btn btn-sm"
        style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page <= 1 ? '#f8fafc' : '#fff', color: page <= 1 ? '#94a3b8' : '#374151' }}>
        <i className="ph ph-caret-left me-1" /> Prev
      </button>
      <button onClick={onNext} disabled={page >= totalPages} className="btn btn-sm"
        style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page >= totalPages ? '#f8fafc' : '#fff', color: page >= totalPages ? '#94a3b8' : '#374151' }}>
        Next <i className="ph ph-caret-right ms-1" />
      </button>
    </div>
  );
}

function MiniBtn({ children, color, onClick, disabled }: { children: React.ReactNode; color: string; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled}
      className="btn btn-sm d-inline-flex align-items-center gap-4"
      style={{ background: `${color}18`, color, border: `1px solid ${color}44`, borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '3px 10px', opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {children}
    </button>
  );
}

// ─── Status / role badges ─────────────────────────────────────────────────────

const TENANT_STATUS_COLORS: Record<string, string> = { active: '#15803d', suspended: '#b91c1c', pending_verification: '#b45309' };
const TENANT_STATUS_ICONS: Record<string, string> = { active: 'ph-check-circle', suspended: 'ph-prohibit', pending_verification: 'ph-clock' };
function TenantStatusBadge({ status }: { status: string }): React.JSX.Element {
  const c = TENANT_STATUS_COLORS[status] ?? '#64748b';
  return (
    <span className="d-inline-flex align-items-center gap-4"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}44`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
      <i className={`ph ${TENANT_STATUS_ICONS[status] ?? 'ph-question'}`} style={{ fontSize: 13 }} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const ROLE_COLORS: Record<string, string> = { buyer: '#2563eb', vendor: '#7c3aed', logistics_provider: '#0891b2', tenant_admin: '#b45309', super_admin: '#b91c1c' };
function RoleBadge({ role }: { role: string }): React.JSX.Element {
  const c = ROLE_COLORS[role] ?? '#64748b';
  return (
    <span className="d-inline-flex align-items-center"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}44`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
      {role.replace(/_/g, ' ')}
    </span>
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
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTenants = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true);
    const result = await api.get<{ data: TenantSummary[] }>(`/api/v1/admin/tenants?page=${p}&per_page=20`);
    if (result.success && result.data) {
      setTenants(result.data.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else setError(result.error?.message ?? 'Failed to load tenants.');
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchTenants(page); }, [fetchTenants, page]);

  const handleSuspend = async (id: string): Promise<void> => {
    setSuspendingId(id);
    const result = await api.post(`/api/v1/admin/tenants/${id}/suspend`, {});
    if (result.success) {
      setActionMsg({ type: 'success', text: 'Tenant suspended.' });
      setTenants(prev => prev.map(t => t.id === id ? { ...t, status: 'suspended' } : t));
    } else setActionMsg({ type: 'error', text: result.error?.message ?? 'Action failed.' });
    setSuspendingId(null);
    setConfirmId(null);
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleReinstate = async (id: string): Promise<void> => {
    setSuspendingId(id);
    const result = await api.post(`/api/v1/admin/tenants/${id}/reinstate`, {});
    if (result.success) {
      setActionMsg({ type: 'success', text: 'Tenant reinstated.' });
      setTenants(prev => prev.map(t => t.id === id ? { ...t, status: 'active' } : t));
    } else setActionMsg({ type: 'error', text: result.error?.message ?? 'Action failed.' });
    setSuspendingId(null);
    setTimeout(() => setActionMsg(null), 3000);
  };

  return (
    <>
      {error && <ErrorBanner message={error} />}
      {actionMsg && (
        <div className="d-flex align-items-center gap-8 mb-3"
          style={{ background: actionMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: actionMsg.type === 'success' ? '#15803d' : '#b91c1c', border: `1px solid ${actionMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
          <i className={`ph ${actionMsg.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'}`} />{actionMsg.text}
        </div>
      )}

      {isLoading ? <LoadingState label="Loading tenants…" /> : tenants.length === 0 ? <EmptyState label="No tenants found." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <TableHead cols={['Tenant', 'Plan', 'Status', 'Users', 'Orders', 'Vendors', 'Actions']} />
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="fw-semibold" style={{ color: '#0f172a' }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{t.slug}</div>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 500 }}>{t.plan}</span>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}><TenantStatusBadge status={t.status} /></td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#475569', textAlign: 'center' }}>{t.user_count}</td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#475569', textAlign: 'center' }}>{t.order_count}</td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#475569', textAlign: 'center' }}>{t.vendor_count}</td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        {confirmId === t.id ? (
                          <div className="d-flex gap-4">
                            <MiniBtn color="#b91c1c" onClick={() => void handleSuspend(t.id)} disabled={suspendingId === t.id}>
                              <i className="ph ph-check" />{suspendingId === t.id ? '…' : 'Confirm'}
                            </MiniBtn>
                            <MiniBtn color="#64748b" onClick={() => setConfirmId(null)}>
                              <i className="ph ph-x" />Cancel
                            </MiniBtn>
                          </div>
                        ) : t.status === 'suspended' ? (
                          <MiniBtn color="#15803d" onClick={() => void handleReinstate(t.id)} disabled={suspendingId === t.id}>
                            <i className="ph ph-arrow-u-up-left" />Reinstate
                          </MiniBtn>
                        ) : (
                          <MiniBtn color="#b91c1c" onClick={() => setConfirmId(t.id)}>
                            <i className="ph ph-prohibit" />Suspend
                          </MiniBtn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {pagination && pagination.total_pages > 1 && (
        <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
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
    } else setError(result.error?.message ?? 'Failed to load users.');
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchUsers(page); }, [fetchUsers, page]);

  const handleSuspend = async (userId: string): Promise<void> => {
    const result = await api.post(`/api/v1/admin/users/${userId}/suspend`, {});
    if (result.success) {
      setSuspendMsg('User suspended.');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: false } : u));
      setTimeout(() => setSuspendMsg(null), 3000);
    }
  };

  return (
    <>
      {error && <ErrorBanner message={error} />}
      {suspendMsg && (
        <div className="d-flex align-items-center gap-8 mb-3"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
          <i className="ph ph-warning-circle" />{suspendMsg}
        </div>
      )}

      {isLoading ? <LoadingState label="Loading users…" /> : users.length === 0 ? <EmptyState label="No users found." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <TableHead cols={['User', 'Role', 'Tenant', 'Active', 'Actions']} />
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="d-flex align-items-center gap-8">
                          <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                            style={{ width: 34, height: 34, background: '#f1f5f9', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="fw-semibold" style={{ color: '#0f172a', fontSize: 13 }}>{u.full_name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}><RoleBadge role={u.role} /></td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{u.tenant_id.slice(0, 8)}…</td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'center' }}>
                        {u.is_active
                          ? <i className="ph ph-check-circle" style={{ color: '#15803d', fontSize: 18 }} />
                          : <i className="ph ph-x-circle" style={{ color: '#b91c1c', fontSize: 18 }} />}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        {u.is_active && (
                          <MiniBtn color="#b91c1c" onClick={() => void handleSuspend(u.id)}>
                            <i className="ph ph-prohibit" />Suspend
                          </MiniBtn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {pagination && pagination.total_pages > 1 && (
        <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
      )}
    </>
  );
}

// ─── Audit Tab ────────────────────────────────────────────────────────────────

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
    } else setError(result.error?.message ?? 'Failed to load audit logs.');
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchLogs(page); }, [fetchLogs, page]);

  return (
    <>
      {error && <ErrorBanner message={error} />}
      {isLoading ? <LoadingState label="Loading audit log…" /> : entries.length === 0 ? <EmptyState label="No audit entries found." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <TableHead cols={['Time', 'Event', 'Resource', 'Tenant', 'IP']} />
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <span style={{ background: '#f1f5f9', color: '#374151', borderRadius: 4, padding: '2px 7px', fontSize: 12, fontFamily: 'monospace', fontWeight: 500 }}>
                          {e.event_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: 12, color: '#64748b' }}>
                        {e.resource_type
                          ? `${e.resource_type}${e.resource_id ? ` / ${e.resource_id.slice(0, 8)}…` : ''}`
                          : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                        {e.tenant_id ? `${e.tenant_id.slice(0, 8)}…` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                        {e.ip_address ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {pagination && pagination.total_pages > 1 && (
        <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage(): React.JSX.Element {
  const [tab, setTab] = useState<AdminTab>('tenants');

  const TAB_CONFIG: { key: AdminTab; label: string; icon: string }[] = [
    { key: 'tenants', label: 'Tenants', icon: 'ph-buildings' },
    { key: 'users',   label: 'Users',   icon: 'ph-users' },
    { key: 'audit',   label: 'Audit Log', icon: 'ph-clock-clockwise' },
  ];

  return (
    <div className="p-4" style={{ maxWidth: 1200 }}>

      {/* Header */}
      <div className="mb-4">
        <h1 className="fw-bold mb-1" style={{ fontSize: 22, color: '#0f172a' }}>Platform Admin</h1>
        <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
          <i className="ph ph-shield-warning me-1" style={{ color: '#b45309' }} />
          Admin console — all actions are audit-logged and role-scoped.
        </p>
      </div>

      {/* Tab bar */}
      <div className="d-flex gap-0 mb-4" style={{ borderBottom: '2px solid #e2e8f0' }}>
        {TAB_CONFIG.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="btn d-flex align-items-center gap-8"
            style={{
              background: 'none', border: 'none',
              borderBottom: tab === t.key ? '2px solid #299E60' : '2px solid transparent',
              marginBottom: -2,
              borderRadius: 0,
              padding: '10px 20px',
              color: tab === t.key ? '#299E60' : '#64748b',
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: 14,
            }}>
            <i className={`ph ${t.icon}`} style={{ fontSize: 16 }} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tenants' && <TenantsTab />}
      {tab === 'users'   && <UsersTab />}
      {tab === 'audit'   && <AuditTab />}
    </div>
  );
}
