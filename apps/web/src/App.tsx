/**
 * App.tsx — Route Structure and Application Shell
 *
 * SECURITY DESIGN:
 * - All protected routes are wrapped in ProtectedRoute (auth guard)
 * - Role-based route protection is layered at route declaration
 * - /login is the only fully public page (+ /unauthorized)
 * - The backend enforces authorization on every API call regardless of frontend route guards
 *
 * ROUTE MAP:
 *   /login                  → Public — LoginPage
 *   /unauthorized           → Public — UnauthorizedPage
 *   /                       → Protected (any auth) → redirect to /dashboard
 *   /dashboard              → Protected (any auth)
 *   /orders                 → Protected (any auth)
 *   /orders/:id             → Protected (any auth)
 *   /quotes                 → Protected (buyer | vendor | logistics_provider | tenant_admin | super_admin)
 *   /documents              → Protected (any auth)
 *   /vendors                → Protected (buyer | tenant_admin | super_admin)
 *   /compliance             → Protected (vendor | tenant_admin | super_admin)
 *   /admin                  → Protected (super_admin only)
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';

/* Lazy-load pages for code splitting — reduces initial bundle size */
const LoginPage       = lazy(() => import('./pages/LoginPage'));
const DashboardPage   = lazy(() => import('./pages/DashboardPage'));
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'));
const OrdersPage      = lazy(() => import('./pages/OrdersPage'));
const QuotesPage      = lazy(() => import('./pages/QuotesPage'));
const DocumentsPage   = lazy(() => import('./pages/DocumentsPage'));
const VendorsPage       = lazy(() => import('./pages/VendorsPage'));
const VendorProfilePage = lazy(() => import('./pages/VendorProfilePage'));
const CompliancePage  = lazy(() => import('./pages/CompliancePage'));
const AdminPage       = lazy(() => import('./pages/AdminPage'));

function PageLoader(): React.JSX.Element {
  return (
    <div aria-live="polite" aria-busy="true" style={{ padding: '3rem', textAlign: 'center' }}>
      Loading...
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes — no layout shell */}
        <Route path="/login"        element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected — any authenticated user, with NavBar layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/"          element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/orders"    element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrdersPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
          </Route>
        </Route>

        {/* Protected — buyers, vendors and admin-level roles */}
        <Route element={<ProtectedRoute roles={['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/quotes" element={<QuotesPage />} />
          </Route>
        </Route>

        {/* Protected — buyers and vendor-managing roles */}
        <Route element={<ProtectedRoute roles={['buyer', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/vendors/:id" element={<VendorProfilePage />} />
          </Route>
        </Route>

        {/* Protected — vendors + admins (vendors need to see their own compliance status) */}
        <Route element={<ProtectedRoute roles={['vendor', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/compliance" element={<CompliancePage />} />
          </Route>
        </Route>

        {/* Protected — super_admin only */}
        <Route element={<ProtectedRoute roles={['super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        {/* Catch-all — redirect to dashboard (authenticated) or login (guest) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

