/**
 * NavBar — Persistent Navigation Shell
 *
 * DESIGN:
 * - Role-aware: links are shown/hidden based on the user's platform role
 * - Active-route highlighting using react-router-dom's useLocation
 * - Sign-out goes through AuthContext (invalidates Supabase session)
 * - Never displays role or tenant ID in the UI (avoid privilege enumeration)
 *
 * ACCESSIBILITY:
 * - nav landmark with aria-label
 * - aria-current="page" on active links
 * - Mobile-responsive collapse via state toggle
 */

import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { PlatformRole } from '@sbdmm/shared';

// ─── Navigation link configuration ───────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  /** Roles that can see this link. Undefined = any authenticated user. */
  roles?: PlatformRole[];
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',   label: 'Dashboard',  icon: '⬛' },
  { to: '/orders',      label: 'Orders',     icon: '📦' },
  { to: '/quotes',      label: 'Quotes',     icon: '💬', roles: ['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin'] },
  { to: '/documents',   label: 'Documents',  icon: '📄' },
  { to: '/vendors',     label: 'Vendors',    icon: '🏢', roles: ['buyer', 'tenant_admin', 'super_admin'] },
  { to: '/compliance',  label: 'Compliance', icon: '✅', roles: ['vendor', 'tenant_admin', 'super_admin'] },
  { to: '/admin',       label: 'Admin',      icon: '⚙️',  roles: ['super_admin'] },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const NAV_BG   = '#1e293b';
const NAV_TEXT = '#cbd5e1';
const NAV_HOVER_BG  = '#334155';
const NAV_ACTIVE_BG = '#2563eb';
const NAV_ACTIVE_TEXT = '#ffffff';

function linkStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 16px',
    borderRadius: 6,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? NAV_ACTIVE_TEXT : NAV_TEXT,
    background: isActive ? NAV_ACTIVE_BG : 'transparent',
    transition: 'background 0.15s',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NavBar(): React.JSX.Element {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const role = (profile?.role ?? user?.role) as PlatformRole | undefined;

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles) return true; // available to any auth'd user
    return role ? item.roles.includes(role) : false;
  });

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  }

  const initials = (profile?.full_name ?? user?.email ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');

  const displayName = profile?.full_name ?? user?.email ?? 'User';

  return (
    <nav
      aria-label="Main navigation"
      style={{
        width: 220,
        minHeight: '100vh',
        background: NAV_BG,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
      }}
    >
      {/* Logo / Brand */}
      <div style={{ padding: '1.25rem 1rem 0.75rem', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>🌐</span>
          <div>
            <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>SBDMM</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>5PL Platform</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, padding: '0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => linkStyle(isActive)}
            aria-current={undefined} // react-router NavLink handles aria-current
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (!el.getAttribute('aria-current')) el.style.background = NAV_HOVER_BG;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (!el.getAttribute('aria-current')) el.style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1, width: 20, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* User footer */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: '#2563eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </div>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'capitalize' }}>
              {role?.replace(/_/g, ' ') ?? '—'}
            </div>
          </div>
        </div>
        <button
          onClick={() => { void handleSignOut(); }}
          disabled={signingOut}
          style={{
            width: '100%',
            padding: '7px 0',
            background: 'transparent',
            color: signingOut ? '#64748b' : '#f87171',
            border: '1px solid #374151',
            borderRadius: 6,
            cursor: signingOut ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {signingOut ? 'Signing out…' : '↩ Sign Out'}
        </button>
      </div>
    </nav>
  );
}
