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
 *   /                       → Public  — LandingPage (authenticated users auto-redirect by role)
 *   /dashboard              → Protected (buyer | tenant_admin | super_admin)
 *   /provider/dashboard     → Protected (vendor | logistics_provider)
 *   /orders                 → Protected (buyer | tenant_admin | super_admin)
 *   /orders/:id             → Protected (buyer | tenant_admin | super_admin)
 *   /quotes                 → Protected (buyer | vendor | logistics_provider | tenant_admin | super_admin)
 *   /documents              → Protected (any auth)
 *   /vendors                → Protected (buyer | tenant_admin | super_admin)
 *   /vendors/:id            → Protected (buyer | vendor | logistics_provider | tenant_admin | super_admin)
 *   /compliance             → Protected (vendor | tenant_admin | super_admin)
 *   /admin                  → Protected (tenant_admin | super_admin)
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';

/* Lazy-load pages for code splitting — reduces initial bundle size */
const LandingPage     = lazy(() => import('./pages/LandingPage'));
const LoginPage       = lazy(() => import('./pages/LoginPage'));
const DashboardPage   = lazy(() => import('./pages/DashboardPage'));
const ProviderDashboardPage = lazy(() => import('./pages/ProviderDashboardPage'));
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
        {/* Public routes — no auth required, no layout shell */}
        <Route path="/"             element={<LandingPage />} />
        <Route path="/login"        element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected — buyer + admins: main dashboard, orders, documents */}
        <Route element={<ProtectedRoute roles={['buyer', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/orders"    element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrdersPage />} />
          </Route>
        </Route>

        {/* Protected — vendors and logistics providers: their own dashboard */}
        <Route element={<ProtectedRoute roles={['vendor', 'logistics_provider']} />}>
          <Route element={<AppLayout />}>
            <Route path="/provider/dashboard" element={<ProviderDashboardPage />} />
          </Route>
        </Route>

        {/* Protected — documents: all authenticated users */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/documents" element={<DocumentsPage />} />
          </Route>
        </Route>

        {/* Protected — quotes: all authenticated users */}
        <Route element={<ProtectedRoute roles={['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/quotes" element={<QuotesPage />} />
          </Route>
        </Route>

        {/* Protected — vendor directory: buyers and admin-level roles */}
        <Route element={<ProtectedRoute roles={['buyer', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/vendors" element={<VendorsPage />} />
          </Route>
        </Route>

        {/* Protected — vendor profile: providers can view their own profile */}
        <Route element={<ProtectedRoute roles={['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/vendors/:id" element={<VendorProfilePage />} />
          </Route>
        </Route>

        {/* Protected — compliance: vendors + admins */}
        <Route element={<ProtectedRoute roles={['vendor', 'logistics_provider', 'tenant_admin', 'super_admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/compliance" element={<CompliancePage />} />
          </Route>
        </Route>

        {/* Protected — admin panel: tenant_admin + super_admin */}
        <Route element={<ProtectedRoute roles={['tenant_admin', 'super_admin']} />}>
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

