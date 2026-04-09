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
 *
 * Profile loading strategy:
 *   • Wait up to MAX_WAIT_MS for a profile to appear (polling via refreshProfile).
 *   • If profile is found → redirect to role home.
 *   • If still no profile after MAX_WAIT_MS → redirect to /onboarding so the
 *     user can complete their account setup.
 *   • If never authenticated → redirect to /login.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { PlatformRole } from '@sbdmm/shared';

const MAX_WAIT_MS = 8000;   // 8 s max before giving up and going to /onboarding
const POLL_MS    = 800;     // retry refreshProfile every 800 ms

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
  const { isAuthenticated, isLoading, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const redirected = useRef(false);
  const startTime  = useRef(Date.now());
  const [statusMsg, setStatusMsg] = useState('Signing you in…');

  useEffect(() => {
    // Wait until AuthContext has finished the initial session check
    if (isLoading) return;
    if (redirected.current) return;

    if (!isAuthenticated) {
      // OAuth failed or user cancelled
      redirected.current = true;
      navigate('/login', { replace: true });
      return;
    }

    if (profile?.role) {
      // Profile already loaded — navigate immediately
      redirected.current = true;
      navigate(getRoleHome(profile.role), { replace: true });
      return;
    }

    // Authenticated but no profile yet (new OAuth user; trigger may still be
    // writing the row). Poll refreshProfile until it resolves or we time out.
    setStatusMsg('Setting up your account…');

    const interval = setInterval(async () => {
      if (redirected.current) { clearInterval(interval); return; }

      const elapsed = Date.now() - startTime.current;

      try {
        await refreshProfile();
      } catch {
        // ignore transient errors — keep polling
      }

      // profile state will update via AuthContext; the effect re-runs via deps.
      // As a safety net, hard-redirect to /onboarding once MAX_WAIT_MS passes.
      if (elapsed >= MAX_WAIT_MS) {
        clearInterval(interval);
        if (!redirected.current) {
          redirected.current = true;
          navigate('/onboarding', { replace: true });
        }
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [isAuthenticated, isLoading, profile, navigate, refreshProfile]);

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
        {statusMsg}
      </p>
    </div>
  );
}
