/**
 * VendorMePage — resolves /vendors/me to /vendors/:id for the logged-in provider.
 *
 * Calls GET /api/v1/vendors/me, receives the vendor's own record,
 * then redirects to /vendors/:id so the full VendorProfilePage renders.
 * If no vendor record exists the user is guided to contact their admin.
 */

import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/apiClient';
import type { Vendor } from '@sbdmm/shared';

export default function VendorMePage(): React.JSX.Element {
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<void> => {
      const result = await api.get<Vendor>('/api/v1/vendors/me');
      if (cancelled) return;
      if (result.success && result.data?.id) {
        setVendorId(result.data.id);
      } else if (result.error?.code === 'NOT_FOUND') {
        setNotFound(true);
      } else {
        setError(result.error?.message ?? 'Unable to load your vendor profile.');
      }
    };
    void resolve();
    return () => { cancelled = true; };
  }, []);

  // Redirect to the full profile page once we have the ID
  if (vendorId) {
    return <Navigate to={`/vendors/${vendorId}`} replace />;
  }

  // No vendor record — guide the user
  if (notFound) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center text-center"
        style={{ minHeight: '60vh', padding: 32 }}
      >
        <div
          className="d-inline-flex align-items-center justify-content-center rounded-circle mb-20"
          style={{ width: 72, height: 72, background: '#fef2f2' }}
        >
          <i className="ph ph-storefront" style={{ fontSize: 32, color: '#b91c1c' }} />
        </div>
        <h2 className="fw-bold mb-8" style={{ fontSize: 22, color: '#0f172a' }}>
          No vendor profile found
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', maxWidth: 420, lineHeight: 1.7 }}>
          Your account doesn't have an associated vendor profile yet. Ask your
          platform administrator to onboard your company, then you'll be able to
          manage your catalogue here.
        </p>
      </div>
    );
  }

  // Generic API error
  if (error) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center text-center"
        style={{ minHeight: '60vh', padding: 32 }}
      >
        <div
          className="d-inline-flex align-items-center justify-content-center rounded-circle mb-20"
          style={{ width: 72, height: 72, background: '#fef2f2' }}
        >
          <i className="ph ph-warning-circle" style={{ fontSize: 32, color: '#b91c1c' }} />
        </div>
        <h2 className="fw-bold mb-8" style={{ fontSize: 22, color: '#0f172a' }}>
          Could not load profile
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', maxWidth: 420 }}>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn btn-sm mt-16"
          style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, padding: '8px 20px' }}
        >
          <i className="ph ph-arrows-clockwise me-1" />
          Retry
        </button>
      </div>
    );
  }

  // Loading
  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '60vh' }}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center">
        <div className="spinner-border mb-12" style={{ color: '#299E60' }} role="status">
          <span className="visually-hidden">Loading your vendor profile…</span>
        </div>
        <p style={{ fontSize: 13, color: '#64748b' }}>Loading your profile…</p>
      </div>
    </div>
  );
}
