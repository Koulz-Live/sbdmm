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
import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function AppLayout(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <NavBar />

      {/* Main content */}
      <main
        id="main-content"
        tabIndex={-1}
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Skip-to-content anchor target */}
        <a
          href="#main-content"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: 'auto',
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        >
          Skip to main content
        </a>

        <Outlet />
      </main>
    </div>
  );
}
