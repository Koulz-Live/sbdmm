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
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <div className="text-center" style={{ maxWidth: 480, padding: 32 }}>
        <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-24" style={{ width: 80, height: 80, background: '#fef2f2' }}>
          <i className="ph ph-lock" style={{ fontSize: 36, color: '#b91c1c' }} />
        </div>
        <h1 className="fw-bold mb-12" style={{ fontSize: 24, color: '#0f172a' }}>Access Denied</h1>
        <p className="mb-24" style={{ color: '#64748b', lineHeight: 1.7, fontSize: 15 }}>
          You don&apos;t have permission to view this page.
          {profile && (
            <> Your current role is <strong style={{ color: '#0f172a' }}>{profile.role.replace('_', ' ')}</strong>.</>
          )}
        </p>
        <Link
          to="/dashboard"
          className="btn d-inline-flex align-items-center gap-8"
          style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 600, textDecoration: 'none', fontSize: 14 }}
        >
          <i className="ph ph-arrow-left" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
