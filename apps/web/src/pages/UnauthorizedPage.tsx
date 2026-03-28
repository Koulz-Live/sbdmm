/**
 * UnauthorizedPage.tsx
 * Shown when an authenticated user attempts to access a route
 * they don't have the role for.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function UnauthorizedPage(): React.JSX.Element {
  const { profile } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'var(--space-8)', textAlign: 'center' }}>
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontSize: '4rem', marginBottom: 'var(--space-4)' }}>🔒</div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-secondary)', marginBottom: 'var(--space-3)' }}>
          Access Denied
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
          You don&apos;t have permission to view this page.
          {profile && (
            <> Your current role is <strong>{profile.role.replace('_', ' ')}</strong>.</>
          )}
        </p>
        <Link
          to="/dashboard"
          style={{ display: 'inline-block', padding: 'var(--space-3) var(--space-6)', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 'var(--text-sm)' }}
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
