/**
 * LoginPage.tsx — Secure Authentication Page
 *
 * Styled with the MarketPro Bootstrap 5 template visual language.
 * Security design preserved: generic error messages, no credential storage.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { PlatformRole } from '@sbdmm/shared';

interface LocationState {
  from?: { pathname: string };
}

function getRoleHome(role: PlatformRole): string {
  switch (role) {
    case 'vendor':
    case 'logistics_provider':
      return '/provider/dashboard';
    case 'tenant_admin':
    case 'super_admin':
      return '/admin';
    default:
      return '/dashboard'; // buyer
  }
}

export default function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithGoogle, isAuthenticated, isLoading, profile } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const locationState = location.state as LocationState | null;
  const from = locationState?.from?.pathname;

  useEffect(() => {
    if (isAuthenticated && profile?.role) {
      // If user was redirected here from a specific page, honour that;
      // otherwise send them to their role-appropriate home.
      const destination = from ?? getRoleHome(profile.role);
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, profile, navigate, from]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        setError(result.error);
      }
      // Navigation is handled by the useEffect above once profile is loaded
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setError(result.error);
        setIsGoogleLoading(false);
      }
      // On success, browser redirects — no further action needed
    } catch {
      setError('Google sign-in failed. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: '#f1f5f9' }}>
        <div className="spinner-border text-main" role="status" style={{ color: '#299E60' }}>
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2417 100%)' }}
    >
      {/* Background decoration */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(41,158,96,0.15) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', left: '-5%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
        }} />
      </div>

      <div className="container" style={{ maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div className="text-center mb-32">
          <div
            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-16"
            style={{ width: 64, height: 64, background: '#299E60', boxShadow: '0 8px 24px rgba(41,158,96,0.4)' }}
          >
            <i className="ph ph-globe text-white" style={{ fontSize: 30 }} />
          </div>
          <h1 className="fw-bold mb-4" style={{ color: '#ffffff', fontSize: 26 }}>
            SBDMM
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>5PL Logistics Marketplace</p>
        </div>

        {/* Card */}
        <div className="card border-0 shadow-lg" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div className="card-body p-40">
            <h2 className="fw-bold mb-8" style={{ fontSize: 20, color: '#0f172a' }}>Welcome back</h2>
            <p className="text-muted mb-24" style={{ fontSize: 14 }}>Sign in to your account to continue</p>

            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div role="alert" className="alert alert-danger d-flex align-items-center gap-8 py-10 px-16 mb-20" style={{ borderRadius: 8, fontSize: 14 }}>
                  <i className="ph ph-warning-circle" style={{ fontSize: 18, flexShrink: 0 }} />
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="mb-20">
                <label htmlFor="email" className="form-label fw-semibold" style={{ fontSize: 14, color: '#374151' }}>
                  Email address
                </label>
                <div className="position-relative">
                  <span
                    className="position-absolute top-50 translate-middle-y"
                    style={{ left: 14, color: '#9ca3af', fontSize: 18, pointerEvents: 'none' }}
                  >
                    <i className="ph ph-envelope" />
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                    disabled={isSubmitting}
                    className="form-control"
                    placeholder="you@company.com"
                    style={{ paddingLeft: 42, borderRadius: 8, height: 46, fontSize: 14 }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="mb-24">
                <label htmlFor="password" className="form-label fw-semibold" style={{ fontSize: 14, color: '#374151' }}>
                  Password
                </label>
                <div className="position-relative">
                  <span
                    className="position-absolute top-50 translate-middle-y"
                    style={{ left: 14, color: '#9ca3af', fontSize: 18, pointerEvents: 'none' }}
                  >
                    <i className="ph ph-lock" />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={isSubmitting}
                    className="form-control"
                    placeholder="••••••••"
                    style={{ paddingLeft: 42, paddingRight: 42, borderRadius: 8, height: 46, fontSize: 14 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="position-absolute top-50 translate-middle-y"
                    style={{ right: 14, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, padding: 0 }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}`} />
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn w-100 d-flex align-items-center justify-content-center gap-8"
                style={{
                  background: '#299E60',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  height: 46,
                  fontSize: 15,
                  fontWeight: 600,
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <i className="ph ph-sign-in" />
                    Sign in
                  </>
                )}
              </button>

              <div className="text-end mt-12">
                <Link to="/forgot-password" style={{ color: '#299E60', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                  Forgot password?
                </Link>
              </div>
            </form>

            {/* ── Divider ── */}
            <div className="d-flex align-items-center my-24" style={{ gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap' }}>
                or continue with
              </span>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>

            {/* ── Google Sign-In ── */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isSubmitting}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                height: 46,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#fff',
                color: '#374151',
                fontSize: 15,
                fontWeight: 600,
                cursor: isGoogleLoading || isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isGoogleLoading || isSubmitting ? 0.6 : 1,
                transition: 'background 0.15s, box-shadow 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
              onMouseEnter={(e) => {
                if (!isGoogleLoading && !isSubmitting) {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
              }}
            >
              {isGoogleLoading ? (
                <span className="spinner-border spinner-border-sm" role="status" style={{ color: '#374151' }} />
              ) : (
                /* Google "G" SVG logo */
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
              )}
              {isGoogleLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <p className="text-center mt-16 mb-0" style={{ fontSize: 12, color: '#94a3b8' }}>
              <i className="ph ph-lock-simple" style={{ fontSize: 13 }} />{' '}
              Admin accounts require email &amp; password sign-in.
            </p>

            <p className="text-center mt-24 mb-0" style={{ fontSize: 13, color: '#94a3b8' }}>
              Having trouble?{' '}
              <a href="mailto:support@sbdmm.io" style={{ color: '#299E60', textDecoration: 'none', fontWeight: 600 }}>
                Contact support
              </a>
            </p>
          </div>
        </div>

        <p className="text-center mt-20" style={{ fontSize: 12, color: '#475569' }}>
          © {new Date().getFullYear()} SBDMM. All rights reserved.
        </p>
      </div>
    </div>
  );
}
