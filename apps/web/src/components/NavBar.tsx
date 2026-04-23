/**
 * NavBar — Persistent Navigation Sidebar
 *
 * Styled using the MarketPro Bootstrap 5 template classes.
 * Role-aware: links shown/hidden based on the user's platform role.
 */

import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import { getTenantOverride, setTenantOverride } from '../lib/apiClient';
import type { PlatformRole } from '@sbdmm/shared';
import { PLATFORM_ROLES } from '@sbdmm/shared';
import { useCart } from '../contexts/CartContext';

interface TenantOption { id: string; name: string }

function TenantSwitcher({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [override, setOverride] = useState<string>(getTenantOverride() ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void api.get<TenantOption[]>('/api/v1/admin/tenants?per_page=100').then(res => {
      if (res.success && res.data) setTenants(res.data ?? []);
    });
  }, []);

  const current = tenants.find(t => t.id === override);

  const handleSelect = (id: string): void => {
    setTenantOverride(id || null);
    setOverride(id);
    setOpen(false);
    // Reload the page so all data refetches with the new tenant context
    window.location.reload();
  };

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <button
        title={collapsed ? 'Switch tenant' : undefined}
        onClick={() => setOpen(o => !o)}
        className="d-flex align-items-center gap-8"
        style={{
          width: '100%',
          padding: collapsed ? '8px' : '8px 12px',
          background: override ? 'rgba(41,158,96,0.12)' : 'transparent',
          color: override ? '#4ade80' : '#94a3b8',
          border: `1px solid ${override ? 'rgba(41,158,96,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          justifyContent: collapsed ? 'center' : 'flex-start',
          overflow: 'hidden',
        }}>
        <i className="ph ph-buildings" style={{ fontSize: 16, flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {current ? current.name : 'Switch Tenant'}
          </span>
        )}
        {!collapsed && <i className={`ph ${open ? 'ph-caret-up' : 'ph-caret-down'}`} style={{ fontSize: 12, flexShrink: 0 }} />}
      </button>

      {open && !collapsed && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 200, overflow: 'hidden',
          maxHeight: 240, overflowY: 'auto',
        }}>
          <button
            onClick={() => handleSelect('')}
            style={{
              display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
              background: !override ? 'rgba(41,158,96,0.15)' : 'transparent',
              color: !override ? '#4ade80' : '#94a3b8',
              border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
            <i className="ph ph-user-circle me-8" style={{ fontSize: 14 }} />
            Own tenant (default)
          </button>
          {tenants.map(t => (
            <button key={t.id} onClick={() => handleSelect(t.id)}
              style={{
                display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                background: override === t.id ? 'rgba(41,158,96,0.15)' : 'transparent',
                color: override === t.id ? '#4ade80' : '#cbd5e1',
                border: 'none', fontSize: 13, fontWeight: override === t.id ? 600 : 400, cursor: 'pointer',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}>
              {t.name}
              {override === t.id && <i className="ph ph-check ms-6" style={{ fontSize: 12, color: '#4ade80' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Role Switcher (super_admin only) ────────────────────────────────────────
// Lets a super_admin preview the UI as any platform role.
// Only affects the frontend — API calls still use the real JWT / real role.
const ROLE_ICONS: Record<PlatformRole, string> = {
  buyer:              'ph ph-user',
  vendor:             'ph ph-storefront',
  logistics_provider: 'ph ph-truck',
  tenant_admin:       'ph ph-shield-check',
  super_admin:        'ph ph-crown-simple',
};

const ROLE_LABELS: Record<PlatformRole, string> = {
  buyer:              'Buyer',
  vendor:             'Vendor',
  logistics_provider: 'Logistics Provider',
  tenant_admin:       'Tenant Admin',
  super_admin:        'Super Admin (real)',
};

function RoleSwitcher({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  const { simulatedRole, setSimulatedRole } = useAuth();
  const [open, setOpen] = useState(false);

  const activeRole = simulatedRole ?? 'super_admin';
  const isSimulating = simulatedRole !== null;

  const handleSelect = (role: PlatformRole): void => {
    setSimulatedRole(role === 'super_admin' ? null : role);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <button
        title={collapsed ? 'Preview role' : undefined}
        onClick={() => setOpen(o => !o)}
        className="d-flex align-items-center gap-8"
        style={{
          width: '100%',
          padding: collapsed ? '8px' : '8px 12px',
          background: isSimulating ? 'rgba(251,191,36,0.15)' : 'transparent',
          color: isSimulating ? '#fbbf24' : '#94a3b8',
          border: `1px solid ${isSimulating ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          justifyContent: collapsed ? 'center' : 'flex-start',
          overflow: 'hidden',
        }}>
        <i className={ROLE_ICONS[activeRole]} style={{ fontSize: 16, flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {isSimulating ? `Preview: ${ROLE_LABELS[simulatedRole!]}` : 'Preview Role'}
          </span>
        )}
        {!collapsed && <i className={`ph ${open ? 'ph-caret-up' : 'ph-caret-down'}`} style={{ fontSize: 12, flexShrink: 0 }} />}
      </button>

      {open && !collapsed && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 200, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fbbf24', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <i className="ph ph-eye me-6" />UI Role Preview
          </div>
          {PLATFORM_ROLES.map(r => (
            <button key={r} onClick={() => handleSelect(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 14px', textAlign: 'left',
                background: activeRole === r ? 'rgba(251,191,36,0.12)' : 'transparent',
                color: activeRole === r ? '#fbbf24' : '#cbd5e1',
                border: 'none', fontSize: 13, fontWeight: activeRole === r ? 600 : 400, cursor: 'pointer',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}>
              <i className={ROLE_ICONS[r]} style={{ fontSize: 15, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{ROLE_LABELS[r]}</span>
              {activeRole === r && <i className="ph ph-check" style={{ fontSize: 12, color: '#fbbf24' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: string; // Phosphor icon class e.g. "ph ph-gauge"
  roles?: PlatformRole[];
}

const NAV_ITEMS: NavItem[] = [
  // ── Feed: all authenticated users
  { to: '/home',               label: 'Home',         icon: 'ph ph-house-simple' },
  // ── Saved items / Wishlist: all authenticated users
  { to: '/saves',              label: 'Wishlist',     icon: 'ph ph-bookmark-simple' },
  // ── Shopping Cart: all authenticated users
  { to: '/cart',               label: 'Cart',         icon: 'ph ph-shopping-cart-simple' },
  // ── Buyer / Admin: main dashboard
  { to: '/dashboard',          label: 'Dashboard',    icon: 'ph ph-chart-line-up', roles: ['buyer', 'tenant_admin', 'super_admin'] },
  // ── Provider: their own dashboard
  { to: '/provider/dashboard', label: 'Dashboard',    icon: 'ph ph-chart-line-up', roles: ['vendor', 'logistics_provider'] },
  // ── Buyer & admins: orders
  { to: '/orders',             label: 'Orders',       icon: 'ph ph-package',       roles: ['buyer', 'tenant_admin', 'super_admin'] },
  // ── Providers: open RFQs they can bid on
  { to: '/rfqs',               label: 'Open RFQs',    icon: 'ph ph-list-magnifying-glass', roles: ['vendor', 'logistics_provider'] },
  // ── Buyer & admins: quotes
  { to: '/quotes',             label: 'Quotes',       icon: 'ph ph-chat-dots',     roles: ['buyer', 'tenant_admin', 'super_admin'] },
  // ── Providers: their own quote history
  { to: '/quotes',             label: 'My Quotes',    icon: 'ph ph-chat-dots',     roles: ['vendor', 'logistics_provider'] },
  // ── Providers: their catalogue
  { to: '/my-catalogue',       label: 'My Catalogue', icon: 'ph ph-storefront',    roles: ['vendor', 'logistics_provider'] },
  // ── Everyone: documents
  { to: '/documents',          label: 'Documents',    icon: 'ph ph-file-text' },
  // ── Buyer & admins: vendor directory
  { to: '/vendors',            label: 'Vendors',      icon: 'ph ph-buildings',     roles: ['buyer', 'tenant_admin', 'super_admin'] },
  // ── Vendor & admins: compliance
  { to: '/compliance',         label: 'Compliance',   icon: 'ph ph-shield-check',  roles: ['vendor', 'tenant_admin', 'super_admin'] },
  // ── Buyer: AI furniture design wizard
  { to: '/design',             label: 'Design My Table', icon: 'ph ph-magic-wand', roles: ['buyer'] },
  // ── Admins only
  { to: '/admin',              label: 'Admin Panel',  icon: 'ph ph-gear',          roles: ['tenant_admin', 'super_admin'] },
  { to: '/settings',           label: 'Settings',     icon: 'ph ph-gear-six',      roles: ['tenant_admin', 'super_admin'] },
];

export function NavBar(): React.JSX.Element {
  const { profile, user, signOut, realRole, simulatedRole } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { count: cartCount } = useCart();

  const role = profile?.role as PlatformRole | undefined;

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles) return true;
    return role ? item.roles.includes(role) : false;
  });

  const displayName = profile?.full_name ?? user?.email ?? 'User';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <nav
      aria-label="Main navigation"
      className="d-flex flex-column flex-shrink-0"
      style={{
        width: collapsed ? 64 : 240,
        minHeight: '100vh',
        background: 'var(--nav-bg)',
        transition: 'width 0.2s ease',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 100,
      }}
    >
      {/* Brand header */}
      <div
        className="d-flex align-items-center px-16 gap-8"
        style={{
          height: 72,
          borderBottom: '1px solid var(--nav-border)',
          flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'space-between',
        }}
      >
        {!collapsed && (
          <div className="d-flex align-items-center gap-8">
            <span
              className="flex-center rounded-8"
              style={{ width: 36, height: 36, background: '#299E60', flexShrink: 0 }}
            >
              <i className="ph ph-globe text-white" style={{ fontSize: 20 }} />
            </span>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>SBDMM</div>
              <div style={{ color: '#94a3b8', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>5PL Platform</div>
            </div>
          </div>
        )}
        {collapsed && (
          <span
            className="flex-center rounded-8"
            style={{ width: 36, height: 36, background: '#299E60' }}
          >
            <i className="ph ph-globe text-white" style={{ fontSize: 20 }} />
          </span>
        )}
        <button
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            fontSize: 18,
          }}
        >
          <i className={`ph ${collapsed ? 'ph-caret-right' : 'ph-caret-left'}`} />
        </button>
      </div>

      {/* Nav links */}
      <div className="flex-grow-1 py-12 px-8 d-flex flex-column" style={{ gap: 4 }}>
        {!collapsed && (
          <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 8px 4px' }}>
            Navigation
          </div>
        )}
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '10px' : '10px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#ffffff' : '#94a3b8',
              background: isActive ? '#299E60' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
              whiteSpace: 'nowrap',
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
                  <i className={item.icon} style={{ fontSize: 18 }} />
                  {/* Cart badge */}
                  {item.to === '/cart' && cartCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: -6,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      background: isActive ? '#fff' : '#299E60',
                      color: isActive ? '#299E60' : '#fff',
                      borderRadius: '50%',
                      fontSize: 9,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 3px',
                      lineHeight: 1,
                    }}>
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </span>
                {!collapsed && item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* User footer */}
      <div style={{ padding: collapsed ? '12px 8px' : '12px 16px', borderTop: '1px solid var(--nav-border)', flexShrink: 0 }}>
        {!collapsed && (
          <div className="d-flex align-items-center gap-10 mb-10">
            <div
              className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-bold text-white"
              style={{ width: 36, height: 36, background: simulatedRole ? '#d97706' : '#299E60', fontSize: 13 }}
            >
              {initials}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </div>
              {simulatedRole ? (
                <div style={{ fontSize: 11 }}>
                  <span style={{ color: '#fbbf24', textTransform: 'capitalize' }}>
                    <i className="ph ph-eye me-4" style={{ fontSize: 10 }} />
                    {simulatedRole.replace(/_/g, ' ')}
                  </span>
                  <span style={{ color: '#94a3b8' }}> (preview)</span>
                </div>
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'capitalize' }}>
                  {role?.replace(/_/g, ' ') ?? '—'}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Super-admin tools (always gated on real role, not simulated) */}
        {realRole === 'super_admin' && <RoleSwitcher collapsed={collapsed} />}
        {realRole === 'super_admin' && <TenantSwitcher collapsed={collapsed} />}
        <button
          onClick={() => { void handleSignOut(); }}
          disabled={signingOut}
          title={collapsed ? 'Sign out' : undefined}
          className="d-flex align-items-center gap-8"
          style={{
            width: '100%',
            padding: collapsed ? '8px' : '8px 12px',
            background: 'transparent',
            color: signingOut ? '#8ba4b8' : '#f87171',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            cursor: signingOut ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <i className="ph ph-sign-out" style={{ fontSize: 16, flexShrink: 0 }} />
          {!collapsed && (signingOut ? 'Signing out…' : 'Sign Out')}
        </button>
      </div>
    </nav>
  );
}
