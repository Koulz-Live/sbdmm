/**
 * ProtectedRoute — Frontend Route Guard
 *
 * SECURITY DESIGN:
 * - Redirects unauthenticated users to /login
 * - Enforces role-based access control at the ROUTE level (for UX)
 * - REMINDER: This is a UX guard, NOT a security boundary.
 *   The backend API enforces authorization on every request.
 *   A user bypassing this guard would still be rejected by the API.
 *
 * USAGE:
 *   <ProtectedRoute>                        → Any authenticated user
 *   <ProtectedRoute roles={['tenant_admin']}> → Only tenant_admin + super_admin
 *   <ProtectedRoute roles={['buyer', 'vendor']}> → Buyers and vendors only
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { PlatformRole } from '@sbdmm/shared';

interface ProtectedRouteProps {
  roles?: PlatformRole[];
  redirectTo?: string;
}

export function ProtectedRoute({
  roles,
  redirectTo = '/login',
}: ProtectedRouteProps): React.JSX.Element {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const location = useLocation();

  // Show nothing (or a spinner) while auth state is loading
  if (isLoading) {
    return (
      <div aria-live="polite" aria-busy="true" style={{ padding: '2rem', textAlign: 'center' }}>
        Loading...
      </div>
    );
  }

  // Redirect to login if not authenticated
  // Preserve the intended destination for post-login redirect
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Role check (UX layer — backend enforces this authoritatively)
  if (roles && roles.length > 0 && profile) {
    const userRole = profile.role;
    // super_admin always passes role checks
    const hasPermission = userRole === 'super_admin' || roles.includes(userRole);

    if (!hasPermission) {
      // Redirect to an "unauthorized" page rather than revealing the destination
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

  return <Outlet />;
}
