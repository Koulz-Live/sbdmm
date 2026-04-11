/**
 * ProtectedRoute — Frontend Route Guard
 *
 * SECURITY DESIGN:
 * - Redirects unauthenticated users to /login
 * - Enforces role-based access control at the ROUTE level (for UX)
 * - For super_admin accessing /admin: enforces MFA enrollment gate
 *   If the super_admin has no verified TOTP factor they are redirected to /mfa-setup
 * - REMINDER: This is a UX guard, NOT a security boundary.
 *   The backend API enforces authorization on every request.
 *   A user bypassing this guard would still be rejected by the API.
 *
 * USAGE:
 *   <ProtectedRoute>                        → Any authenticated user
 *   <ProtectedRoute roles={['tenant_admin']}> → Only tenant_admin + super_admin
 *   <ProtectedRoute roles={['buyer', 'vendor']}> → Buyers and vendors only
 *   <ProtectedRoute requireMfa>             → Must have verified TOTP factor
 */

import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/apiClient';
import type { PlatformRole } from '@sbdmm/shared';

interface ProtectedRouteProps {
  roles?: PlatformRole[];
  redirectTo?: string;
  /** If true, also check that the user has a verified TOTP factor */
  requireMfa?: boolean;
}

export function ProtectedRoute({
  roles,
  redirectTo = '/login',
  requireMfa = false,
}: ProtectedRouteProps): React.JSX.Element {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const location = useLocation();

  // MFA check state
  const [mfaStatus, setMfaStatus] = useState<'idle' | 'checking' | 'enrolled' | 'missing'>('idle');

  // Run the MFA enrollment check whenever the user is a super_admin and requireMfa is set
  useEffect(() => {
    if (!requireMfa) return;
    if (!profile || profile.role !== 'super_admin') return;
    if (mfaStatus !== 'idle') return;

    setMfaStatus('checking');
    void api.get<{ enrolled: boolean }>('/api/v1/auth/mfa-status').then(res => {
      if (res.success && res.data?.enrolled) {
        setMfaStatus('enrolled');
      } else {
        setMfaStatus('missing');
      }
    });
  }, [requireMfa, profile, mfaStatus]);

  // ─── Loading states ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div aria-live="polite" aria-busy="true" style={{ padding: '2rem', textAlign: 'center' }}>
        Loading...
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Role check (UX layer — backend enforces this authoritatively)
  if (roles && roles.length > 0 && profile) {
    const userRole = profile.role;
    // super_admin always passes role checks
    const hasPermission = userRole === 'super_admin' || roles.includes(userRole);
    if (!hasPermission) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // If profile hasn't loaded yet but user is authenticated, wait
  if (!profile && roles && roles.length > 0) {
    return (
      <div aria-live="polite" aria-busy="true" style={{ padding: '2rem', textAlign: 'center' }}>
        Loading profile...
      </div>
    );
  }

  // ─── MFA gate — only applies to super_admin + requireMfa routes ──────────
  if (requireMfa && profile?.role === 'super_admin') {
    if (mfaStatus === 'idle' || mfaStatus === 'checking') {
      return (
        <div aria-live="polite" aria-busy="true" style={{ padding: '2rem', textAlign: 'center' }}>
          Verifying security…
        </div>
      );
    }
    if (mfaStatus === 'missing') {
      // Super admin has no verified TOTP — send to setup
      return <Navigate to="/mfa-setup" state={{ from: location }} replace />;
    }
  }

  return <Outlet />;
}
