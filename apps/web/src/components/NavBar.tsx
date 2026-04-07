/**
 * NavBar — Persistent Navigation Sidebar
 *
 * Styled using the MarketPro Bootstrap 5 template classes.
 * Role-aware: links shown/hidden based on the user's platform role.
 */

import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { PlatformRole } from '@sbdmm/shared';

interface NavItem {
  to: string;
  label: string;
  icon: string; // Phosphor icon class e.g. "ph ph-gauge"
  roles?: PlatformRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',  label: 'Dashboard',  icon: 'ph ph-chart-line-up' },
  { to: '/orders',     label: 'Orders',     icon: 'ph ph-package' },
  { to: '/quotes',     label: 'Quotes',     icon: 'ph ph-chat-dots',   roles: ['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin'] },
  { to: '/documents',  label: 'Documents',  icon: 'ph ph-file-text' },
  { to: '/vendors',    label: 'Vendors',    icon: 'ph ph-storefront',  roles: ['buyer', 'tenant_admin', 'super_admin'] },
  { to: '/compliance', label: 'Compliance', icon: 'ph ph-shield-check', roles: ['vendor', 'tenant_admin', 'super_admin'] },
  { to: '/admin',      label: 'Admin',      icon: 'ph ph-gear',        roles: ['super_admin'] },
];

export function NavBar(): React.JSX.Element {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
        background: '#1e293b',
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
          borderBottom: '1px solid rgba(255,255,255,0.08)',
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
              <div style={{ color: '#64748b', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>5PL Platform</div>
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
            color: '#64748b',
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
          <div style={{ color: '#475569', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 8px 4px' }}>
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
            })}
          >
            <i className={item.icon} style={{ fontSize: 18, flexShrink: 0 }} />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </div>

      {/* User footer */}
      <div style={{ padding: collapsed ? '12px 8px' : '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        {!collapsed && (
          <div className="d-flex align-items-center gap-10 mb-10">
            <div
              className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-bold text-white"
              style={{ width: 36, height: 36, background: '#299E60', fontSize: 13 }}
            >
              {initials}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'capitalize' }}>
                {role?.replace(/_/g, ' ') ?? '—'}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => { void handleSignOut(); }}
          disabled={signingOut}
          title={collapsed ? 'Sign out' : undefined}
          className="d-flex align-items-center gap-8"
          style={{
            width: '100%',
            padding: collapsed ? '8px' : '8px 12px',
            background: 'transparent',
            color: signingOut ? '#475569' : '#f87171',
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
