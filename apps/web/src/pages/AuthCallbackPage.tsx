/**
 * AuthCallbackPage — OAuth redirect landing page
 *
 * After Google (or any OAuth provider) signs the user in, Supabase redirects
 * to this route with the session tokens in the URL hash fragment.
 *
 * Supabase's JS client automatically parses the fragment via
 * onAuthStateChange, which triggers AuthContext to load the profile.
 * This page simply waits for that to complete and then sends the user to
 * their role-appropriate home — or /login if something went wrong.
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { PlatformRole } from '@sbdmm/shared';

function getRoleHome(role: PlatformRole): string {
  switch (role) {
    case 'vendor':
    case 'logistics_provider':
      return '/provider/dashboard';
    case 'tenant_admin':
    case 'super_admin':
      return '/admin';
    default:
      return '/dashboard';
  }
}

export default function AuthCallbackPage(): React.JSX.Element {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const navigate = useNavigate();
  const redirected = useRef(false);

  useEffect(() => {
    // Wait until AuthContext has finished loading the session + profile
    if (isLoading) return;
    if (redirected.current) return;

    redirected.current = true;

    if (isAuthenticated && profile?.role) {
      navigate(getRoleHome(profile.role), { replace: true });
    } else if (isAuthenticated && !profile) {
      // Session exists but profile hasn't loaded yet — wait a tick
      // This branch is rarely hit; the timeout gives loadProfile time to finish
      const timer = setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      // Not authenticated — OAuth failed or user cancelled
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isLoading, profile, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2417 100%)',
        gap: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#299E60',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(41,158,96,0.4)',
          marginBottom: 8,
        }}
      >
        <i className="ph ph-check" style={{ fontSize: 28, color: '#fff' }} />
      </div>
      <div className="spinner-border" style={{ color: '#299E60', width: 32, height: 32 }} role="status">
        <span className="visually-hidden">Loading…</span>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 15, margin: 0 }}>
        Signing you in…
      </p>
    </div>
  );
}
