/**
 * AdminPage — Platform administration console.
 *
 * Accessible to tenant_admin and super_admin roles.
 * Route guard at the router level already blocks other roles;
 * the backend enforces role checks on every endpoint independently.
 *
 * Tabs: Tenants | Users | Audit Log | Vendor Queue
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import type { TenantSummary, UserProfile, PaginationMeta, Vendor, PlatformRole } from '@sbdmm/shared';
import { PLATFORM_ROLES } from '@sbdmm/shared';

type AdminTab = 'tenants' | 'users' | 'audit' | 'vendors';

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
    const result = await api.get<TenantSummary[]>(`/api/v1/admin/tenants?page=${p}&per_page=20`);
    if (result.success && result.data) {
      setTenants(result.data ?? []);
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

// ─── Users Tab — full CRUD ────────────────────────────────────────────────────

const ROLE_ICON: Record<string, string> = {
  buyer: 'ph-user', vendor: 'ph-storefront', logistics_provider: 'ph-truck',
  tenant_admin: 'ph-shield-check', super_admin: 'ph-crown-simple',
};

interface EditDraft {
  full_name: string;
  role: PlatformRole;
  is_active: boolean;
}

interface InviteDraft {
  email: string;
  full_name: string;
  role: PlatformRole;
  tenant_id: string;
}

function UserEditModal({
  user, onClose, onSaved,
}: { user: UserProfile; onClose: () => void; onSaved: (updated: UserProfile) => void }): React.JSX.Element {
  const [draft, setDraft] = useState<EditDraft>({
    full_name: user.full_name,
    role: user.role,
    is_active: user.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setSaving(true); setErr(null);
    const result = await api.patch<UserProfile>(`/api/v1/admin/users/${user.id}`, draft);
    if (result.success && result.data) {
      onSaved(result.data);
    } else {
      setErr(result.error?.message ?? 'Update failed.');
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 14, color: '#0f172a', background: '#fff', outline: 'none',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-20">
          <div>
            <div className="fw-bold" style={{ fontSize: 17, color: '#0f172a' }}>Edit User</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{user.id.slice(0, 12)}…</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>
            <i className="ph ph-x" />
          </button>
        </div>

        {err && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>{err}</div>}

        {/* Full name */}
        <div className="mb-16">
          <label style={labelStyle}>Full Name</label>
          <input style={inputStyle} value={draft.full_name} onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))} />
        </div>

        {/* Role selector */}
        <div className="mb-16">
          <label style={labelStyle}>Role</label>
          <select style={inputStyle} value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value as PlatformRole }))}>
            {PLATFORM_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {/* Active toggle */}
        <div className="d-flex align-items-center justify-content-between mb-24 p-12" style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div>
            <div className="fw-semibold" style={{ fontSize: 14, color: '#0f172a' }}>Account Active</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Inactive users cannot sign in</div>
          </div>
          <button
            onClick={() => setDraft(d => ({ ...d, is_active: !d.is_active }))}
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
              background: draft.is_active ? '#299E60' : '#cbd5e1', transition: 'background 0.2s',
            }}>
            <span style={{
              position: 'absolute', top: 3, left: draft.is_active ? 22 : 3, width: 18, height: 18,
              borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {/* Actions */}
        <div className="d-flex gap-10 justify-content-end">
          <button onClick={onClose} className="btn btn-sm"
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 20px', color: '#64748b', background: '#f8fafc', fontSize: 14 }}>
            Cancel
          </button>
          <button onClick={() => void handleSave()} disabled={saving} className="btn btn-sm"
            style={{ borderRadius: 8, padding: '8px 24px', background: '#299E60', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteUserModal({
  tenants, onClose, onInvited,
}: { tenants: TenantSummary[]; onClose: () => void; onInvited: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState<InviteDraft>({ email: '', full_name: '', role: 'buyer', tenant_id: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSend = async (): Promise<void> => {
    if (!draft.email || !draft.full_name) { setErr('Email and name are required.'); return; }
    setSaving(true); setErr(null);
    const payload: Record<string, string> = { email: draft.email, full_name: draft.full_name, role: draft.role };
    if (draft.tenant_id) payload['tenant_id'] = draft.tenant_id;
    const result = await api.post('/api/v1/admin/users/invite', payload);
    if (result.success) {
      onInvited();
    } else {
      setErr(result.error?.message ?? 'Invite failed.');
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 14, color: '#0f172a', background: '#fff', outline: 'none',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 460, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div className="d-flex align-items-center justify-content-between mb-20">
          <div className="fw-bold" style={{ fontSize: 17, color: '#0f172a' }}>Invite New User</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>
            <i className="ph ph-x" />
          </button>
        </div>

        {err && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>{err}</div>}

        <div className="mb-14">
          <label style={labelStyle}>Email Address</label>
          <input type="email" style={inputStyle} placeholder="user@example.com" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
        </div>
        <div className="mb-14">
          <label style={labelStyle}>Full Name</label>
          <input style={inputStyle} placeholder="Jane Smith" value={draft.full_name} onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))} />
        </div>
        <div className="mb-14">
          <label style={labelStyle}>Role</label>
          <select style={inputStyle} value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value as PlatformRole }))}>
            {PLATFORM_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="mb-24">
          <label style={labelStyle}>Tenant <span style={{ fontWeight: 400, color: '#94a3b8' }}>(leave blank to use your own)</span></label>
          <select style={inputStyle} value={draft.tenant_id} onChange={e => setDraft(d => ({ ...d, tenant_id: e.target.value }))}>
            <option value="">— My tenant (default) —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="d-flex gap-10 justify-content-end">
          <button onClick={onClose} className="btn btn-sm"
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 20px', color: '#64748b', background: '#f8fafc', fontSize: 14 }}>
            Cancel
          </button>
          <button onClick={() => void handleSend()} disabled={saving} className="btn btn-sm"
            style={{ borderRadius: 8, padding: '8px 24px', background: '#299E60', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><span className="spinner-border spinner-border-sm me-1" />Sending…</> : <><i className="ph ph-paper-plane-tilt me-1" />Send Invite</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ tenants }: { tenants: TenantSummary[] }): React.JSX.Element {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals
  const [editUser, setEditUser]       = useState<UserProfile | null>(null);
  const [deleteUser, setDeleteUser]   = useState<UserProfile | null>(null);
  const [showInvite, setShowInvite]   = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', text: string): void => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const buildUrl = useCallback((p: number, s: string, role: string, active: string) => {
    const params = new URLSearchParams({ page: String(p), per_page: '20' });
    if (s)      params.set('search', s);
    if (role)   params.set('role', role);
    if (active) params.set('is_active', active);
    return `/api/v1/admin/users?${params.toString()}`;
  }, []);

  const fetchUsers = useCallback(async (p: number, s = search, role = filterRole, active = filterActive): Promise<void> => {
    setIsLoading(true); setError(null);
    const result = await api.get<UserProfile[]>(buildUrl(p, s, role, active));
    if (result.success && result.data) {
      setUsers(result.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else {
      setError(result.error?.message ?? 'Failed to load users.');
    }
    setIsLoading(false);
  }, [search, filterRole, filterActive, buildUrl]);

  useEffect(() => { void fetchUsers(page); }, [fetchUsers, page]);

  // Debounce search input
  const handleSearchChange = (val: string): void => {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); void fetchUsers(1, val, filterRole, filterActive); }, 350);
  };

  const handleFilterChange = (role: string, active: string): void => {
    setFilterRole(role); setFilterActive(active);
    setPage(1);
    void fetchUsers(1, search, role, active);
  };

  const handleSuspend = async (userId: string): Promise<void> => {
    const result = await api.post(`/api/v1/admin/users/${userId}/suspend`, {});
    if (result.success) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: false } : u));
      showToast('success', 'User suspended — all sessions invalidated.');
    } else {
      showToast('error', result.error?.message ?? 'Suspension failed.');
    }
    setConfirmDeleteId(null);
  };

  const handleReinstate = async (userId: string): Promise<void> => {
    const result = await api.post(`/api/v1/admin/users/${userId}/reinstate`, {});
    if (result.success) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: true } : u));
      showToast('success', 'User reinstated.');
    } else {
      showToast('error', result.error?.message ?? 'Reinstate failed.');
    }
  };

  const handleDelete = async (userId: string): Promise<void> => {
    setDeletingId(userId);
    const result = await api.delete(`/api/v1/admin/users/${userId}`);
    if (result.success) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      showToast('success', 'User permanently deleted.');
    } else {
      showToast('error', result.error?.message ?? 'Delete failed.');
    }
    setDeletingId(null);
    setDeleteUser(null);
  };

  const handleSaved = (updated: UserProfile): void => {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setEditUser(null);
    showToast('success', 'User updated.');
  };

  const selectStyle: React.CSSProperties = {
    padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer',
  };

  return (
    <>
      {/* Modals */}
      {editUser && <UserEditModal user={editUser} onClose={() => setEditUser(null)} onSaved={handleSaved} />}
      {showInvite && <InviteUserModal tenants={tenants} onClose={() => setShowInvite(false)} onInvited={() => { setShowInvite(false); void fetchUsers(1); showToast('success', 'Invitation sent!'); }} />}

      {/* Delete confirm modal */}
      {deleteUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="d-flex align-items-center gap-12 mb-16">
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ph ph-trash" style={{ fontSize: 22, color: '#b91c1c' }} />
              </div>
              <div>
                <div className="fw-bold" style={{ fontSize: 16, color: '#0f172a' }}>Delete User?</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>This removes them from auth — cannot be undone.</div>
              </div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <div className="fw-semibold" style={{ fontSize: 14, color: '#0f172a' }}>{deleteUser.full_name}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{deleteUser.role.replace(/_/g, ' ')}</div>
            </div>
            <div className="d-flex gap-10 justify-content-end">
              <button onClick={() => setDeleteUser(null)} className="btn btn-sm"
                style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 18px', color: '#64748b', background: '#f8fafc', fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={() => void handleDelete(deleteUser.id)} disabled={deletingId === deleteUser.id} className="btn btn-sm"
                style={{ borderRadius: 8, padding: '8px 20px', background: '#b91c1c', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14 }}>
                {deletingId === deleteUser.id ? <><span className="spinner-border spinner-border-sm me-1" />Deleting…</> : <><i className="ph ph-trash me-1" />Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: toast.type === 'success' ? '#15803d' : '#b91c1c',
          border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className={`ph ${toast.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'}`} style={{ fontSize: 18 }} />
          {toast.text}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Toolbar */}
      <div className="d-flex align-items-center gap-10 mb-16 flex-wrap">
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <i className="ph ph-magnifying-glass" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 16 }} />
          <input
            type="text" placeholder="Search by name…"
            value={search} onChange={e => handleSearchChange(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a' }}
          />
        </div>
        {/* Role filter */}
        <select style={selectStyle} value={filterRole} onChange={e => handleFilterChange(e.target.value, filterActive)}>
          <option value="">All roles</option>
          {PLATFORM_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
        {/* Active filter */}
        <select style={selectStyle} value={filterActive} onChange={e => handleFilterChange(filterRole, e.target.value)}>
          <option value="">All status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        {/* Invite button */}
        <button onClick={() => setShowInvite(true)} className="btn btn-sm d-flex align-items-center gap-6"
          style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
          <i className="ph ph-user-plus" style={{ fontSize: 16 }} />Invite User
        </button>
      </div>

      {/* Table */}
      {isLoading ? <LoadingState label="Loading users…" /> : users.length === 0 ? <EmptyState label="No users match your filters." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <TableHead cols={['User', 'Role', 'Tenant', 'Joined', 'Status', 'Actions']} />
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      {/* User cell */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="d-flex align-items-center gap-10">
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569', fontSize: 13, flexShrink: 0 }}>
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="fw-semibold" style={{ color: '#0f172a', fontSize: 13 }}>{u.full_name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{u.id.slice(0, 12)}…</div>
                          </div>
                        </div>
                      </td>
                      {/* Role cell */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <span className="d-inline-flex align-items-center gap-5"
                          style={{ background: `${ROLE_COLORS[u.role] ?? '#64748b'}18`, color: ROLE_COLORS[u.role] ?? '#64748b', border: `1px solid ${ROLE_COLORS[u.role] ?? '#64748b'}44`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                          <i className={`ph ${ROLE_ICON[u.role] ?? 'ph-user'}`} style={{ fontSize: 12 }} />
                          {u.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      {/* Tenant cell */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px' }}>
                          {u.tenant_id.slice(0, 8)}…
                        </span>
                      </td>
                      {/* Joined */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      {/* Status */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        {u.is_active ? (
                          <span className="d-inline-flex align-items-center gap-4"
                            style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                            <i className="ph ph-check-circle" style={{ fontSize: 13 }} />Active
                          </span>
                        ) : (
                          <span className="d-inline-flex align-items-center gap-4"
                            style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                            <i className="ph ph-x-circle" style={{ fontSize: 13 }} />Suspended
                          </span>
                        )}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="d-flex gap-6 align-items-center">
                          {/* Edit */}
                          <button title="Edit user" onClick={() => setEditUser(u)}
                            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#475569', fontSize: 14, lineHeight: 1 }}>
                            <i className="ph ph-pencil-simple" />
                          </button>
                          {/* Suspend / Reinstate */}
                          {confirmDeleteId === u.id ? (
                            <div className="d-flex gap-4">
                              <button onClick={() => void handleSuspend(u.id)}
                                style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                                Confirm
                              </button>
                              <button onClick={() => setConfirmDeleteId(null)}
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#64748b', fontSize: 12 }}>
                                Cancel
                              </button>
                            </div>
                          ) : u.is_active ? (
                            <button title="Suspend user" onClick={() => setConfirmDeleteId(u.id)}
                              style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#854d0e', fontSize: 14, lineHeight: 1 }}>
                              <i className="ph ph-prohibit" />
                            </button>
                          ) : (
                            <button title="Reinstate user" onClick={() => void handleReinstate(u.id)}
                              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#15803d', fontSize: 14, lineHeight: 1 }}>
                              <i className="ph ph-arrow-u-up-left" />
                            </button>
                          )}
                          {/* Delete */}
                          <button title="Delete user" onClick={() => setDeleteUser(u)}
                            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: '#b91c1c', fontSize: 14, lineHeight: 1 }}>
                            <i className="ph ph-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="d-flex align-items-center justify-content-between mt-3">
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            {pagination.total} user{pagination.total !== 1 ? 's' : ''} · page {pagination.page} of {pagination.total_pages}
          </div>
          <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
        </div>
      )}
    </>
  );
}

// ─── Audit Intelligence Tab ───────────────────────────────────────────────────

type AuditSubTab = 'overview' | 'events' | 'users' | 'ips' | 'ai' | 'navigation';

interface AuditLogEntry {
  id: string;
  event_type: string;
  actor_id: string;
  tenant_id: string | null;
  target_type: string | null;
  target_id: string | null;
  outcome: 'success' | 'failure' | 'blocked';
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  page_path: string | null;
  geo_country: string | null;
  geo_city: string | null;
  session_id: string | null;
  created_at: string;
}

interface BlockedIp {
  id: string;
  ip_address: string;
  reason: string;
  blocked_by: string;
  is_active: boolean;
  expires_at: string | null;
  geo_country: string | null;
  geo_city: string | null;
  geo_isp: string | null;
  hit_count: number;
  created_at: string;
  unblocked_at: string | null;
}

interface AiUsageLog {
  id: string;
  user_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  feature: string | null;
  outcome: string;
  latency_ms: number | null;
  page_path: string | null;
  created_at: string;
}

interface NavLog {
  id: string;
  page_path: string;
  referrer_path: string | null;
  duration_ms: number | null;
  ip_address: string | null;
  geo_country: string | null;
  geo_city: string | null;
  created_at: string;
}

interface AuditStats {
  summary: {
    events_24h:   number;
    events_30d:   number;
    ai_calls_24h: number;
    failures_24h: number;
    blocked_24h:  number;
    blocked_ips:  number;
  };
  top_ips: Array<{ ip_address: string; count: number }>;
  ai_per_user: Array<{ user_id: string; requests: number; total_tokens: number; cost_usd: number; models: string[] }>;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub }: { icon: string; label: string; value: number | string; color: string; sub?: string }): React.JSX.Element {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 22px', flex: 1, minWidth: 150 }}>
      <div className="d-flex align-items-center gap-10 mb-10">
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`ph ${icon}`} style={{ fontSize: 18, color }} />
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Outcome badge ────────────────────────────────────────────────────────────
function OutcomeBadge({ outcome }: { outcome: string }): React.JSX.Element {
  const map: Record<string, { bg: string; color: string; icon: string }> = {
    success: { bg: '#f0fdf4', color: '#15803d', icon: 'ph-check-circle' },
    failure: { bg: '#fef2f2', color: '#b91c1c', icon: 'ph-x-circle' },
    blocked: { bg: '#fff7ed', color: '#c2410c', icon: 'ph-prohibit' },
  };
  const s = map[outcome] ?? { bg: '#f1f5f9', color: '#64748b', icon: 'ph-question' };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33`, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <i className={`ph ${s.icon}`} style={{ fontSize: 12 }} />{outcome}
    </span>
  );
}

// ─── Country flag helper ──────────────────────────────────────────────────────
function countryFlag(iso?: string | null): string {
  if (!iso || iso.length !== 2) return '🌐';
  const offset = 127397;
  return String.fromCodePoint(...Array.from(iso.toUpperCase()).map(c => c.charCodeAt(0) + offset));
}

// ─── Block IP Modal ───────────────────────────────────────────────────────────
function BlockIpModal({ onClose, onBlocked }: { onClose: () => void; onBlocked: () => void }): React.JSX.Element {
  const [ip, setIp]         = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a', outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' };

  const handleSave = async (): Promise<void> => {
    if (!ip.trim() || !reason.trim()) { setErr('IP address and reason are required.'); return; }
    setSaving(true); setErr(null);
    const result = await api.post('/api/v1/admin/blocked-ips', { ip_address: ip.trim(), reason: reason.trim() });
    if (result.success) { onBlocked(); }
    else { setErr(result.error?.message ?? 'Failed to block IP.'); setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div className="d-flex align-items-center gap-12 mb-20">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ph ph-shield-slash" style={{ fontSize: 20, color: '#b91c1c' }} />
          </div>
          <div>
            <div className="fw-bold" style={{ fontSize: 16, color: '#0f172a' }}>Block IP Address</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>All requests from this IP will be rejected</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, marginLeft: 'auto' }}>
            <i className="ph ph-x" />
          </button>
        </div>
        {err && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>{err}</div>}
        <div className="mb-14">
          <label style={labelStyle}>IP Address or CIDR Range</label>
          <input style={inputStyle} placeholder="e.g. 198.51.100.42 or 198.51.100.0/24" value={ip} onChange={e => setIp(e.target.value)} />
        </div>
        <div className="mb-24">
          <label style={labelStyle}>Reason for Block</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} placeholder="Describe the reason for blocking this IP…" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div className="d-flex gap-10 justify-content-end">
          <button onClick={onClose} className="btn btn-sm"
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 18px', color: '#64748b', background: '#f8fafc', fontSize: 14 }}>Cancel</button>
          <button onClick={() => void handleSave()} disabled={saving} className="btn btn-sm"
            style={{ borderRadius: 8, padding: '8px 22px', background: '#b91c1c', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><span className="spinner-border spinner-border-sm me-1" />Blocking…</> : <><i className="ph ph-shield-slash me-1" />Block IP</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Activity Drawer ─────────────────────────────────────────────────────
function UserActivityDrawer({ userId, onClose }: { userId: string; onClose: () => void }): React.JSX.Element {
  const [data, setData] = useState<{
    profile: { full_name: string; role: string; is_active: boolean; created_at: string };
    audit_events: AuditLogEntry[];
    page_nav: NavLog[];
    ai_usage: AiUsageLog[];
    ai_summary: { total_requests: number; total_tokens: number; total_cost_usd: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerTab, setDrawerTab] = useState<'events' | 'nav' | 'ai'>('events');

  useEffect(() => {
    void api.get<typeof data>(`/api/v1/admin/users/${userId}/audit-logs`).then(res => {
      if (res.success && res.data) setData(res.data);
      setLoading(false);
    });
  }, [userId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 680, maxWidth: '95vw', height: '100vh', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Drawer header */}
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div className="d-flex align-items-center justify-content-between mb-8">
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>User Activity</div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22 }}>
              <i className="ph ph-x" />
            </button>
          </div>
          {data && (
            <div className="d-flex align-items-center gap-12 mt-8">
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569', fontSize: 16 }}>
                {data.profile.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="fw-bold" style={{ fontSize: 15, color: '#0f172a' }}>{data.profile.full_name}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{data.profile.role.replace(/_/g, ' ')} · joined {new Date(data.profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <span style={{ marginLeft: 'auto', background: data.profile.is_active ? '#f0fdf4' : '#fef2f2', color: data.profile.is_active ? '#15803d' : '#b91c1c', border: `1px solid ${data.profile.is_active ? '#bbf7d0' : '#fecaca'}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                {data.profile.is_active ? 'Active' : 'Suspended'}
              </span>
            </div>
          )}
          {/* Drawer sub-tabs */}
          <div className="d-flex gap-0 mt-16" style={{ borderBottom: '2px solid #f1f5f9' }}>
            {(['events', 'nav', 'ai'] as const).map(t => (
              <button key={t} onClick={() => setDrawerTab(t)}
                style={{ background: 'none', border: 'none', borderBottom: drawerTab === t ? '2px solid #299E60' : '2px solid transparent', marginBottom: -2, padding: '7px 16px', color: drawerTab === t ? '#299E60' : '#64748b', fontWeight: drawerTab === t ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
                {t === 'events' ? '📋 Audit Events' : t === 'nav' ? '🗺️ Page Navigation' : '🤖 AI Usage'}
              </button>
            ))}
          </div>
        </div>

        {/* Drawer body */}
        <div style={{ padding: '20px 28px', flex: 1 }}>
          {loading ? <LoadingState label="Loading user activity…" /> : !data ? <EmptyState label="Failed to load user data." /> : (
            <>
              {/* AI Summary cards — always shown */}
              {drawerTab === 'ai' && (
                <div className="d-flex gap-12 mb-20 flex-wrap">
                  <div style={{ flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Total Requests</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{data.ai_summary.total_requests}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Total Tokens</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{data.ai_summary.total_tokens.toLocaleString()}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Est. Cost</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>${data.ai_summary.total_cost_usd.toFixed(4)}</div>
                  </div>
                </div>
              )}

              {/* Events tab */}
              {drawerTab === 'events' && (
                data.audit_events.length === 0 ? <EmptyState label="No audit events found for this user." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.audit_events.map(e => (
                      <div key={e.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                        <div className="d-flex align-items-center justify-content-between mb-6">
                          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#374151', background: '#e2e8f0', borderRadius: 4, padding: '2px 7px' }}>{e.event_type}</span>
                          <OutcomeBadge outcome={e.outcome} />
                        </div>
                        <div className="d-flex gap-16 flex-wrap" style={{ fontSize: 11, color: '#94a3b8' }}>
                          <span><i className="ph ph-clock me-1" />{new Date(e.created_at).toLocaleString()}</span>
                          {e.ip_address && <span><i className="ph ph-wifi-high me-1" />{e.ip_address}</span>}
                          {e.page_path && <span><i className="ph ph-browser me-1" />{e.page_path}</span>}
                          {e.geo_country && <span>{countryFlag(e.geo_country)} {e.geo_city ? `${e.geo_city}, ` : ''}{e.geo_country}</span>}
                        </div>
                        {e.target_type && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                            Target: <span style={{ fontFamily: 'monospace' }}>{e.target_type}{e.target_id ? ` / ${e.target_id.slice(0, 12)}…` : ''}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Page nav tab */}
              {drawerTab === 'nav' && (
                data.page_nav.length === 0 ? <EmptyState label="No navigation data available for this user." /> : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                      <TableHead cols={['Page', 'From', 'Duration', 'IP', 'Time']} />
                      <tbody>
                        {data.page_nav.map(n => (
                          <tr key={n.id}>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 12, color: '#0f172a', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.page_path}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.referrer_path ?? '—'}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: '#475569', whiteSpace: 'nowrap', fontSize: 12 }}>{n.duration_ms != null ? `${(n.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{n.ip_address ?? '—'}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(n.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* AI usage tab */}
              {drawerTab === 'ai' && (
                data.ai_usage.length === 0 ? <EmptyState label="No AI usage recorded for this user." /> : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                      <TableHead cols={['Model', 'Feature', 'Tokens', 'Cost', 'Latency', 'Outcome', 'Time']} />
                      <tbody>
                        {data.ai_usage.map(a => (
                          <tr key={a.id}>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '2px 6px' }}>{a.model}</span>
                            </td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>{a.feature ?? '—'}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{a.total_tokens.toLocaleString()}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>{a.estimated_cost_usd != null ? `$${Number(a.estimated_cost_usd).toFixed(5)}` : '—'}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>{a.latency_ms != null ? `${a.latency_ms}ms` : '—'}</td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}><OutcomeBadge outcome={a.outcome} /></td>
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Audit Tab ────────────────────────────────────────────────────────────────

function AuditTab(): React.JSX.Element {
  const [subTab, setSubTab] = useState<AuditSubTab>('overview');
  const [toast, setToast]   = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string): void => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const SUB_TABS: { key: AuditSubTab; label: string; icon: string }[] = [
    { key: 'overview',   label: 'Overview',       icon: 'ph-chart-bar' },
    { key: 'events',     label: 'Event Log',      icon: 'ph-list-bullets' },
    { key: 'users',      label: 'User Activity',  icon: 'ph-user-circle' },
    { key: 'ips',        label: 'IP Management',  icon: 'ph-shield-warning' },
    { key: 'ai',         label: 'AI Usage',       icon: 'ph-robot' },
    { key: 'navigation', label: 'Page Navigation',icon: 'ph-compass' },
  ];

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2000, background: toast.type === 'success' ? '#f0fdf4' : '#fef2f2', color: toast.type === 'success' ? '#15803d' : '#b91c1c', border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className={`ph ${toast.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'}`} style={{ fontSize: 18 }} />{toast.text}
        </div>
      )}

      {/* Sub-tab bar */}
      <div className="d-flex gap-0 mb-20 flex-wrap" style={{ borderBottom: '2px solid #e2e8f0' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="btn d-flex align-items-center gap-6"
            style={{ background: 'none', border: 'none', borderBottom: subTab === t.key ? '2px solid #299E60' : '2px solid transparent', marginBottom: -2, borderRadius: 0, padding: '9px 16px', color: subTab === t.key ? '#299E60' : '#64748b', fontWeight: subTab === t.key ? 700 : 500, fontSize: 13 }}>
            <i className={`ph ${t.icon}`} style={{ fontSize: 15 }} />{t.label}
          </button>
        ))}
      </div>

      {subTab === 'overview'   && <AuditOverviewPanel />}
      {subTab === 'events'     && <AuditEventsPanel />}
      {subTab === 'users'      && <AuditUsersPanel showToast={showToast} />}
      {subTab === 'ips'        && <AuditIpsPanel showToast={showToast} />}
      {subTab === 'ai'         && <AuditAiPanel />}
      {subTab === 'navigation' && <AuditNavPanel />}
    </div>
  );
}

// ─── Overview Panel ───────────────────────────────────────────────────────────
function AuditOverviewPanel(): React.JSX.Element {
  const [stats, setStats]     = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    void api.get<AuditStats>('/api/v1/admin/audit-logs/stats').then(res => {
      if (res.success && res.data) setStats(res.data);
      else setError(res.error?.message ?? 'Failed to load stats.');
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState label="Loading statistics…" />;
  if (error)   return <ErrorBanner message={error} />;
  if (!stats)  return <EmptyState label="No statistics available." />;

  const { summary, top_ips, ai_per_user } = stats;

  return (
    <div>
      {/* Summary cards */}
      <div className="d-flex gap-12 mb-24 flex-wrap">
        <StatCard icon="ph-activity"         label="Events (24h)"     value={summary.events_24h.toLocaleString()}  color="#2563eb"  sub="All event types" />
        <StatCard icon="ph-calendar-blank"   label="Events (30d)"     value={summary.events_30d.toLocaleString()}  color="#7c3aed"  sub="Past 30 days" />
        <StatCard icon="ph-robot"            label="AI Calls (24h)"   value={summary.ai_calls_24h.toLocaleString()}color="#0891b2"  sub="Across all users" />
        <StatCard icon="ph-warning-circle"   label="Failures (24h)"   value={summary.failures_24h.toLocaleString()}color="#b45309"  sub="Failed requests" />
        <StatCard icon="ph-prohibit"         label="Blocked Events"   value={summary.blocked_24h.toLocaleString()} color="#b91c1c"  sub="Last 24h" />
        <StatCard icon="ph-shield-warning"   label="Blocked IPs"      value={summary.blocked_ips.toLocaleString()} color="#991b1b"  sub="Currently active" />
      </div>

      <div className="row g-3">
        {/* Top IPs */}
        <div className="col-md-6">
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div className="fw-bold mb-14" style={{ fontSize: 14, color: '#0f172a' }}>
              <i className="ph ph-globe me-2" style={{ color: '#0891b2' }} />Top IPs (30d)
            </div>
            {top_ips.length === 0 ? <EmptyState label="No IP data yet." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {top_ips.map((row, i) => (
                  <div key={row.ip_address} className="d-flex align-items-center justify-content-between" style={{ padding: '7px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div className="d-flex align-items-center gap-10">
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#e2e8f0', fontSize: 10, fontWeight: 700, color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#0f172a' }}>{row.ip_address}</span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{row.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top AI users */}
        <div className="col-md-6">
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <div className="fw-bold mb-14" style={{ fontSize: 14, color: '#0f172a' }}>
              <i className="ph ph-robot me-2" style={{ color: '#7c3aed' }} />Top AI Users (30d)
            </div>
            {ai_per_user.length === 0 ? <EmptyState label="No AI usage data yet." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ai_per_user.slice(0, 8).map((u, i) => (
                  <div key={u.user_id} className="d-flex align-items-center justify-content-between" style={{ padding: '7px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div className="d-flex align-items-center gap-10">
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#e2e8f0', fontSize: 10, fontWeight: 700, color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{u.user_id.slice(0, 14)}…</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{u.requests} req · {u.total_tokens.toLocaleString()} tok</div>
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>${u.cost_usd.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Events Panel ─────────────────────────────────────────────────────────────
function AuditEventsPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage]       = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Filters
  const [search, setSearch]       = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [filterEvent, setFilterEvent]     = useState('');
  const [filterIp, setFilterIp]           = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback((p: number): string => {
    const params = new URLSearchParams({ page: String(p), per_page: '50' });
    if (search)        params.set('search', search);
    if (filterOutcome) params.set('outcome', filterOutcome);
    if (filterEvent)   params.set('event_type', filterEvent);
    if (filterIp)      params.set('ip_address', filterIp);
    if (filterDateFrom) params.set('date_from', new Date(filterDateFrom).toISOString());
    if (filterDateTo)   params.set('date_to', new Date(filterDateTo).toISOString());
    return `/api/v1/admin/audit-logs?${params.toString()}`;
  }, [search, filterOutcome, filterEvent, filterIp, filterDateFrom, filterDateTo]);

  const fetchLogs = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true); setError(null);
    const result = await api.get<AuditLogEntry[]>(buildUrl(p));
    if (result.success && result.data) {
      setEntries(result.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else setError(result.error?.message ?? 'Failed to load audit logs.');
    setIsLoading(false);
  }, [buildUrl]);

  useEffect(() => { void fetchLogs(page); }, [fetchLogs, page]);

  const handleSearchChange = (val: string): void => {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); void fetchLogs(1); }, 400);
  };

  const selectStyle: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', background: '#fff' };

  const EVENT_TYPES = ['user.login', 'user.logout', 'user.mfa_challenge', 'ai.request_made', 'ai.high_risk_action_requested', 'admin.role_assigned', 'admin.user_suspended', 'admin.super_action', 'vendor.onboarding_approved', 'order.created', 'compliance.check_failed'];

  return (
    <>
      {error && <ErrorBanner message={error} />}

      {/* Filter toolbar */}
      <div className="d-flex gap-8 mb-16 flex-wrap align-items-center">
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <i className="ph ph-magnifying-glass" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 15 }} />
          <input type="text" placeholder="Search events, IPs, pages…" value={search} onChange={e => handleSearchChange(e.target.value)}
            style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a' }} />
        </div>
        <select style={selectStyle} value={filterEvent} onChange={e => { setFilterEvent(e.target.value); setPage(1); }}>
          <option value="">All event types</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filterOutcome} onChange={e => { setFilterOutcome(e.target.value); setPage(1); }}>
          <option value="">All outcomes</option>
          <option value="success">✅ Success</option>
          <option value="failure">❌ Failure</option>
          <option value="blocked">🚫 Blocked</option>
        </select>
        <input type="text" placeholder="Filter by IP…" value={filterIp} onChange={e => { setFilterIp(e.target.value); setPage(1); }}
          style={{ ...selectStyle, width: 140, fontFamily: 'monospace', fontSize: 12 }} />
        <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} style={selectStyle} title="From date" />
        <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} style={selectStyle} title="To date" />
        {(search || filterOutcome || filterEvent || filterIp || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setSearch(''); setFilterOutcome(''); setFilterEvent(''); setFilterIp(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            <i className="ph ph-x me-1" />Clear
          </button>
        )}
      </div>

      {isLoading ? <LoadingState label="Loading events…" /> : entries.length === 0 ? <EmptyState label="No events match your filters." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <TableHead cols={['Time', 'Event Type', 'Actor', 'Target', 'IP / Geo', 'Page', 'Outcome']} />
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '2px 7px', fontWeight: 600, color: '#374151' }}>{e.event_type}</span>
                      </td>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                        {e.actor_id.slice(0, 10)}…
                      </td>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle', fontSize: 12, color: '#64748b' }}>
                        {e.target_type ? `${e.target_type}` : '—'}
                        {e.target_id ? <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }}>{e.target_id.slice(0, 10)}…</div> : null}
                      </td>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                        {e.ip_address ? (
                          <div>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#0f172a' }}>{e.ip_address}</span>
                            {e.geo_country && <div style={{ fontSize: 10, color: '#94a3b8' }}>{countryFlag(e.geo_country)} {e.geo_city ? `${e.geo_city}, ` : ''}{e.geo_country}</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.page_path ?? '—'}
                      </td>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                        <OutcomeBadge outcome={e.outcome} />
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
        <div className="d-flex align-items-center justify-content-between mt-3">
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{pagination.total.toLocaleString()} events · page {pagination.page} of {pagination.total_pages}</div>
          <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
        </div>
      )}
    </>
  );
}

// ─── User Activity Panel ──────────────────────────────────────────────────────
function AuditUsersPanel({ showToast }: { showToast: (type: 'success' | 'error', text: string) => void }): React.JSX.Element {
  const [users, setUsers]       = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage]         = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchUsers = useCallback(async (p: number, s: string): Promise<void> => {
    setIsLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(p), per_page: '20' });
    if (s) params.set('search', s);
    const result = await api.get<UserProfile[]>(`/api/v1/admin/users?${params.toString()}`);
    if (result.success && result.data) {
      setUsers(result.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else setError(result.error?.message ?? 'Failed to load users.');
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchUsers(page, search); }, [fetchUsers, page]);

  const handleSearch = (val: string): void => {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); void fetchUsers(1, val); }, 350);
  };

  return (
    <>
      {drawerUserId && <UserActivityDrawer userId={drawerUserId} onClose={() => setDrawerUserId(null)} />}
      {error && <ErrorBanner message={error} />}

      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 16 }}>
        <i className="ph ph-magnifying-glass" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 15 }} />
        <input type="text" placeholder="Search users…" value={search} onChange={e => handleSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a' }} />
      </div>

      {isLoading ? <LoadingState label="Loading users…" /> : users.length === 0 ? <EmptyState label="No users found." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <TableHead cols={['User', 'Role', 'Status', 'Joined', 'Actions']} />
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="d-flex align-items-center gap-10">
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569', fontSize: 12, flexShrink: 0 }}>
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="fw-semibold" style={{ color: '#0f172a', fontSize: 13 }}>{u.full_name}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{u.id.slice(0, 14)}…</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <span style={{ background: `${ROLE_COLORS[u.role] ?? '#64748b'}18`, color: ROLE_COLORS[u.role] ?? '#64748b', border: `1px solid ${ROLE_COLORS[u.role] ?? '#64748b'}44`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                          {u.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <span style={{ background: u.is_active ? '#f0fdf4' : '#fef2f2', color: u.is_active ? '#15803d' : '#b91c1c', border: `1px solid ${u.is_active ? '#bbf7d0' : '#fecaca'}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: 12, color: '#64748b' }}>
                        {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <button onClick={() => { setDrawerUserId(u.id); void showToast; }}
                          className="btn btn-sm d-inline-flex align-items-center gap-6"
                          style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#374151' }}>
                          <i className="ph ph-clock-clockwise" style={{ fontSize: 14 }} />Activity
                        </button>
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
        <div className="d-flex align-items-center justify-content-between mt-3">
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{pagination.total} users · page {pagination.page} of {pagination.total_pages}</div>
          <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
        </div>
      )}
    </>
  );
}

// ─── IP Management Panel ──────────────────────────────────────────────────────
function AuditIpsPanel({ showToast }: { showToast: (type: 'success' | 'error', text: string) => void }): React.JSX.Element {
  const [ips, setIps]           = useState<BlockedIp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showActive, setShowActive] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [page, setPage]         = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchIps = useCallback(async (p: number, active: boolean): Promise<void> => {
    setIsLoading(true); setError(null);
    const result = await api.get<BlockedIp[]>(`/api/v1/admin/blocked-ips?page=${p}&per_page=50&active=${active}`);
    if (result.success && result.data) {
      setIps(result.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else setError(result.error?.message ?? 'Failed to load blocked IPs.');
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchIps(page, showActive); }, [fetchIps, page, showActive]);

  const handleUnblock = async (ip: string): Promise<void> => {
    setUnblocking(ip);
    const result = await api.delete(`/api/v1/admin/blocked-ips/${encodeURIComponent(ip)}`);
    if (result.success) {
      setIps(prev => prev.filter(b => b.ip_address !== ip));
      showToast('success', `${ip} has been unblocked.`);
    } else {
      showToast('error', result.error?.message ?? 'Unblock failed.');
    }
    setUnblocking(null);
  };

  return (
    <>
      {showBlockModal && (
        <BlockIpModal
          onClose={() => setShowBlockModal(false)}
          onBlocked={() => { setShowBlockModal(false); showToast('success', 'IP blocked successfully.'); void fetchIps(1, true); }}
        />
      )}
      {error && <ErrorBanner message={error} />}

      {/* Toolbar */}
      <div className="d-flex align-items-center gap-10 mb-16 flex-wrap">
        <div className="d-flex gap-0" style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => { setShowActive(true); setPage(1); }}
            style={{ padding: '7px 16px', border: 'none', background: showActive ? '#299E60' : '#fff', color: showActive ? '#fff' : '#64748b', fontWeight: showActive ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
            Active Blocks
          </button>
          <button onClick={() => { setShowActive(false); setPage(1); }}
            style={{ padding: '7px 16px', border: 'none', background: !showActive ? '#299E60' : '#fff', color: !showActive ? '#fff' : '#64748b', fontWeight: !showActive ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
            History
          </button>
        </div>
        <button onClick={() => setShowBlockModal(true)} className="btn btn-sm d-flex align-items-center gap-6 ms-auto"
          style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13 }}>
          <i className="ph ph-shield-slash" style={{ fontSize: 15 }} />Block IP
        </button>
      </div>

      {isLoading ? <LoadingState label="Loading blocked IPs…" /> : ips.length === 0 ? (
        <div className="text-center py-5">
          <i className="ph ph-shield-check" style={{ fontSize: 40, color: '#22c55e', display: 'block', marginBottom: 12 }} />
          <div className="fw-semibold" style={{ color: '#374151', fontSize: 14 }}>{showActive ? 'No active blocks' : 'No history found'}</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Block suspicious IPs using the button above.</div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <TableHead cols={['IP / CIDR', 'Geo', 'Reason', 'Hits', 'Expires', 'Blocked', 'Actions']} />
                <tbody>
                  {ips.map(b => (
                    <tr key={b.id}>
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{b.ip_address}</span>
                        {!b.is_active && <span style={{ marginLeft: 6, fontSize: 10, background: '#f1f5f9', color: '#94a3b8', borderRadius: 4, padding: '1px 5px' }}>unblocked</span>}
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>
                        {b.geo_country ? (
                          <span>{countryFlag(b.geo_country)} {b.geo_city ? `${b.geo_city}, ` : ''}{b.geo_country}</span>
                        ) : '—'}
                        {b.geo_isp && <div style={{ fontSize: 10, color: '#94a3b8' }}>{b.geo_isp}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#374151' }} title={b.reason}>
                        {b.reason}
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: b.hit_count > 0 ? '#b91c1c' : '#64748b', fontSize: 13 }}>{b.hit_count.toLocaleString()}</span>
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontSize: 11, color: '#64748b' }}>
                        {b.expires_at ? new Date(b.expires_at).toLocaleDateString('en-GB') : <span style={{ color: '#991b1b', fontWeight: 600 }}>Permanent</span>}
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                        {b.is_active ? (
                          <button onClick={() => void handleUnblock(b.ip_address)} disabled={unblocking === b.ip_address}
                            className="btn btn-sm d-inline-flex align-items-center gap-5"
                            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '4px 10px', fontSize: 12, color: '#15803d', fontWeight: 500, opacity: unblocking === b.ip_address ? 0.6 : 1 }}>
                            {unblocking === b.ip_address ? <span className="spinner-border spinner-border-sm" /> : <i className="ph ph-lock-open" />}
                            Unblock
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {b.unblocked_at ? new Date(b.unblocked_at).toLocaleDateString('en-GB') : 'Removed'}
                          </span>
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
        <div className="d-flex align-items-center justify-content-between mt-3">
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{pagination.total} entries · page {pagination.page} of {pagination.total_pages}</div>
          <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
        </div>
      )}
    </>
  );
}

// ─── AI Usage Panel ───────────────────────────────────────────────────────────
function AuditAiPanel(): React.JSX.Element {
  const [logs, setLogs]         = useState<AiUsageLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [page, setPage]         = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [filterModel, setFilterModel] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');

  const fetchLogs = useCallback(async (p: number): Promise<void> => {
    setIsLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(p), per_page: '50' });
    if (filterModel)    params.set('model', filterModel);
    if (filterDateFrom) params.set('date_from', new Date(filterDateFrom).toISOString());
    if (filterDateTo)   params.set('date_to', new Date(filterDateTo).toISOString());
    const result = await api.get<AiUsageLog[]>(`/api/v1/admin/ai-usage?${params.toString()}`);
    if (result.success && result.data) {
      setLogs(result.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else setError(result.error?.message ?? 'Failed to load AI usage.');
    setIsLoading(false);
  }, [filterModel, filterDateFrom, filterDateTo]);

  useEffect(() => { void fetchLogs(page); }, [fetchLogs, page]);

  const selectStyle: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', background: '#fff' };

  // Compute totals from current page
  const totalTokens = logs.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
  const totalCost   = logs.reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0);

  return (
    <>
      {error && <ErrorBanner message={error} />}

      {/* Quick summary for current page */}
      {logs.length > 0 && (
        <div className="d-flex gap-12 mb-16 flex-wrap">
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Tokens (page)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0c4a6e' }}>{totalTokens.toLocaleString()}</div>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Est. Cost (page)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#14532d' }}>${totalCost.toFixed(5)}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="d-flex gap-8 mb-16 align-items-center flex-wrap">
        <select style={selectStyle} value={filterModel} onChange={e => { setFilterModel(e.target.value); setPage(1); }}>
          <option value="">All models</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
        </select>
        <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} style={selectStyle} title="From date" />
        <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} style={selectStyle} title="To date" />
      </div>

      {isLoading ? <LoadingState label="Loading AI usage…" /> : logs.length === 0 ? <EmptyState label="No AI usage logged yet." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <TableHead cols={['User', 'Model', 'Feature', 'Tokens', 'Cost', 'Latency', 'Page', 'Outcome', 'Time']} />
                <tbody>
                  {logs.map(a => (
                    <tr key={a.id}>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }}>{a.user_id.slice(0, 12)}…</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '2px 6px' }}>{a.model}</span>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>{a.feature ?? '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{a.total_tokens.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>{a.estimated_cost_usd != null ? `$${Number(a.estimated_cost_usd).toFixed(5)}` : '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>{a.latency_ms != null ? `${a.latency_ms}ms` : '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.page_path ?? '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}><OutcomeBadge outcome={a.outcome} /></td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {pagination && pagination.total_pages > 1 && (
        <div className="d-flex align-items-center justify-content-between mt-3">
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{pagination.total.toLocaleString()} requests · page {pagination.page} of {pagination.total_pages}</div>
          <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
        </div>
      )}
    </>
  );
}

// ─── Page Navigation Panel ────────────────────────────────────────────────────
function AuditNavPanel(): React.JSX.Element {
  const [logs, setLogs]         = useState<(NavLog & { user_id: string; tenant_id: string; session_id: string | null })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [page, setPage]         = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [filterPath, setFilterPath] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async (p: number, path: string): Promise<void> => {
    setIsLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(p), per_page: '100' });
    if (path) params.set('path', path);
    const result = await api.get<typeof logs>(`/api/v1/admin/page-navigation?${params.toString()}`);
    if (result.success && result.data) {
      setLogs(result.data ?? []);
      if (result.meta?.pagination) setPagination(result.meta.pagination);
    } else setError(result.error?.message ?? 'Failed to load navigation logs.');
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchLogs(page, filterPath); }, [fetchLogs, page]);

  const handlePathFilter = (val: string): void => {
    setFilterPath(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); void fetchLogs(1, val); }, 350);
  };

  // Compute top pages from current batch
  const pageCounts: Record<string, number> = {};
  for (const l of logs) pageCounts[l.page_path] = (pageCounts[l.page_path] ?? 0) + 1;
  const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      {error && <ErrorBanner message={error} />}

      {/* Top pages quick view */}
      {topPages.length > 0 && (
        <div className="mb-16">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Most Visited Pages (current page)</div>
          <div className="d-flex gap-8 flex-wrap">
            {topPages.map(([p, count]) => (
              <div key={p} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', color: '#374151' }}>{p}</span>
                <span style={{ marginLeft: 8, fontWeight: 700, color: '#2563eb' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 14 }}>
        <i className="ph ph-magnifying-glass" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 15 }} />
        <input type="text" placeholder="Filter by page path…" value={filterPath} onChange={e => handlePathFilter(e.target.value)}
          style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', fontFamily: 'monospace' }} />
      </div>

      {isLoading ? <LoadingState label="Loading navigation logs…" /> : logs.length === 0 ? <EmptyState label="No page navigation data. Install the frontend SDK to start tracking." /> : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <TableHead cols={['User', 'Page', 'From', 'Duration', 'IP', 'Geo', 'Time']} />
                <tbody>
                  {logs.map(n => (
                    <tr key={n.id}>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }}>{n.user_id.slice(0, 12)}…</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 11, color: '#0f172a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.page_path}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.referrer_path ?? '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>{n.duration_ms != null ? `${(n.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{n.ip_address ?? '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 12, color: '#475569' }}>
                        {n.geo_country ? `${countryFlag(n.geo_country)} ${n.geo_city ? `${n.geo_city}, ` : ''}${n.geo_country}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{new Date(n.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {pagination && pagination.total_pages > 1 && (
        <div className="d-flex align-items-center justify-content-between mt-3">
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{pagination.total.toLocaleString()} events · page {pagination.page} of {pagination.total_pages}</div>
          <PagerRow page={page} totalPages={pagination.total_pages} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
        </div>
      )}
    </>
  );
}

// ─── Vendor Queue Tab ─────────────────────────────────────────────────────────

function VendorQueueTab(): React.JSX.Element {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null); // vendorId being actioned

  const fetchPending = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Vendor[]>('/api/v1/vendors?status=pending_review');
      if (res.success && res.data) {
        setVendors(res.data.filter(v => v.status === 'pending_review'));
      } else {
        setError(res.error?.message ?? 'Failed to load vendors.');
      }
    } catch {
      setError('Unable to load vendor queue. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPending(); }, [fetchPending]);

  async function handleAction(vendorId: string, action: 'approved' | 'rejected'): Promise<void> {
    setActioning(vendorId);
    setError(null);
    try {
      const res = await api.patch<Vendor>(`/api/v1/vendors/${vendorId}/status`, { status: action });
      if (res.success) {
        setVendors(vs => vs.filter(v => v.id !== vendorId));
      } else {
        setError(res.error?.message ?? `Failed to ${action === 'approved' ? 'approve' : 'reject'} vendor.`);
      }
    } catch {
      setError(`Unable to update vendor status. Please try again.`);
    } finally {
      setActioning(null);
    }
  }

  if (loading) return <LoadingState label="Loading vendor queue…" />;

  return (
    <>
      {error && <ErrorBanner message={error} />}

      {vendors.length === 0 ? (
        <div className="text-center py-5">
          <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16"
            style={{ width: 64, height: 64, background: '#f0fdf4' }}>
            <i className="ph ph-check-circle" style={{ fontSize: 30, color: '#22c55e' }} />
          </div>
          <p className="fw-semibold mb-4" style={{ color: '#374151', fontSize: 15 }}>All clear — no pending vendors.</p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>New vendor registrations awaiting approval will appear here.</p>
        </div>
      ) : (
        <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <TableHead cols={['Vendor', 'Type', 'Region', 'Registered', 'Actions']} />
                <tbody>
                  {vendors.map(v => (
                    <tr key={v.id}>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="fw-semibold" style={{ color: '#0f172a' }}>{v.company_name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{v.id.slice(0, 12)}…</div>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <RoleBadge role={v.business_category} />
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#475569' }}>
                        {v.country_of_registration}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="d-flex gap-6">
                          <MiniBtn color="#15803d" onClick={() => { void handleAction(v.id, 'approved'); }} disabled={actioning === v.id}>
                            <i className="ph ph-check" /> Approve
                          </MiniBtn>
                          <MiniBtn color="#b91c1c" onClick={() => { void handleAction(v.id, 'rejected'); }} disabled={actioning === v.id}>
                            <i className="ph ph-x" /> Reject
                          </MiniBtn>
                        </div>
                      </td>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage(): React.JSX.Element {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'super_admin';

  const [tab, setTab] = useState<AdminTab>('tenants');
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [pendingVendorCount, setPendingVendorCount] = useState<number | null>(null);

  useEffect(() => {
    // Load tenants list (used by UsersTab's invite modal)
    void api.get<{ data: TenantSummary[] }>('/api/v1/admin/tenants?per_page=100').then(res => {
      if (res.success && res.data) setTenants(res.data.data ?? []);
    });
    void api.get<Vendor[]>('/api/v1/vendors?status=pending_review').then(res => {
      if (res.success && res.data) setPendingVendorCount(res.data.filter(v => v.status === 'pending_review').length);
    });
  }, []);

  const ALL_TABS: { key: AdminTab; label: string; icon: string; superAdminOnly?: boolean }[] = [
    { key: 'tenants', label: 'Tenants',   icon: 'ph-buildings' },
    { key: 'users',   label: 'Users',     icon: 'ph-users' },
    { key: 'audit',   label: 'Audit Log', icon: 'ph-clock-clockwise', superAdminOnly: true },
    { key: 'vendors', label: pendingVendorCount ? `Vendor Queue (${pendingVendorCount})` : 'Vendor Queue', icon: 'ph-storefront' },
  ];

  // Filter audit tab out for tenant_admin; they will never see it in the UI
  const TAB_CONFIG = ALL_TABS.filter(t => !t.superAdminOnly || isSuperAdmin);

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
      {tab === 'users'   && <UsersTab tenants={tenants} />}
      {tab === 'audit'   && isSuperAdmin && <AuditTab />}
      {tab === 'vendors' && <VendorQueueTab />}
    </div>
  );
}
