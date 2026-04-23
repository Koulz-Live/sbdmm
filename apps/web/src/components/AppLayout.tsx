/**
 * AppLayout — Main Application Shell
 *
 * Wraps all protected routes with the persistent NavBar sidebar
 * and a scrollable main content area.
 *
 * USAGE: Nest inside a ProtectedRoute as a layout route:
 *   <Route element={<ProtectedRoute />}>
 *     <Route element={<AppLayout />}>
 *       <Route path="/dashboard" element={<DashboardPage />} />
 *       ...
 *     </Route>
 *   </Route>
 */

import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NavBar } from './NavBar';
import { NotificationsDropdown } from './NotificationsDropdown';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

/** Map route paths → human-readable page titles for the top bar */
const PAGE_TITLES: Record<string, string> = {
  '/home':               'Home',
  '/saves':              'Saved Items',
  '/cart':               'My Cart',
  '/dashboard':          'Dashboard',
  '/provider/dashboard': 'My Dashboard',
  '/orders':             'Orders',
  '/quotes':             'Quotes',
  '/documents':          'Documents',
  '/vendors':            'Vendors',
  '/compliance':         'Compliance',
  '/admin':              'Admin Panel',
  '/forgot-password':    'Reset Password',
};

export function AppLayout(): React.JSX.Element {
  const { pathname } = useLocation();
  const { simulatedRole, setSimulatedRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  // Match exact path first, then try prefix match for dynamic routes (e.g. /vendors/:id)
  const pageTitle =
    PAGE_TITLES[pathname] ??
    Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k + '/'))?.[1] ??
    'SBDMM';

  return (
    <div className="d-flex" style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      {/* Skip-to-content link (a11y) */}
      <a
        href="#main-content"
        className="visually-hidden"
      >
        Skip to main content
      </a>

      <NavBar />

      {/* Right-hand content column */}
      <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
        {/* Top bar */}
        <header
          className="d-flex align-items-center px-24"
          style={{
            height: 64,
            background: 'var(--topbar-bg)',
            borderBottom: '1px solid var(--topbar-border)',
            flexShrink: 0,
            gap: 16,
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}
        >
          <h1
            className="mb-0 fw-bold"
            style={{ fontSize: 18, color: 'var(--text-primary)', flex: 1 }}
          >
            {pageTitle}
          </h1>

          {/* Role preview banner — shown when super_admin is simulating a role */}
          {simulatedRole && (
            <div
              className="d-flex align-items-center gap-8"
              style={{
                padding: '5px 12px',
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: 8,
                color: '#92400e',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              <i className="ph ph-eye" style={{ fontSize: 14 }} />
              Previewing: {simulatedRole.replace(/_/g, ' ')}
              <button
                onClick={() => setSimulatedRole(null)}
                title="Exit role preview"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#92400e',
                  padding: '0 0 0 6px',
                  fontSize: 14,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <i className="ph ph-x" />
              </button>
            </div>
          )}

          {/* Quick actions */}
          <div className="d-flex align-items-center gap-12">
            <NotificationsDropdown />
            {/* Dark / light mode toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 20,
                display: 'flex',
                alignItems: 'center',
                padding: 4,
                borderRadius: 6,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
            >
              <i className={theme === 'dark' ? 'ph ph-sun' : 'ph ph-moon'} />
            </button>
            <button
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}
              aria-label="Settings"
            >
              <i className="ph ph-gear" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-grow-1"
          style={{ overflowY: 'auto', padding: 24 }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
