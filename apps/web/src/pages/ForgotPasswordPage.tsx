/**
 * ForgotPasswordPage.tsx — Password Reset Request
 *
 * Calls supabase.auth.resetPasswordForEmail() which sends a magic link.
 * The redirect URL must match the "Redirect URLs" allowlist in the
 * Supabase project settings (Authentication → URL Configuration).
 *
 * SECURITY:
 * - Generic success message regardless of whether the email exists
 *   (prevents user enumeration — attacker cannot tell if email is registered)
 * - Rate-limited by Supabase on the auth side
 * - No password is ever transmitted on this page
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail]           = useState('');
  const [submitted, setSubmitted]   = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError('Please enter your email address.'); return; }

    setSubmitting(true);
    try {
      const { error: sbError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          // Must be added to Supabase "Redirect URLs" allowlist:
          // https://supabase.com/dashboard → Authentication → URL Configuration
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      // SECURITY: Do NOT surface sbError to the user — always show the same
      // "check your email" message to avoid user enumeration.
      if (sbError) {
        // Log in dev only
        if (import.meta.env.DEV) console.error('[ForgotPassword]', sbError.message);
      }
      // Always transition to the confirmation screen
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

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
            <i className="ph ph-lock-key-open text-white" style={{ fontSize: 30 }} />
          </div>
          <h1 className="fw-bold mb-4" style={{ color: '#ffffff', fontSize: 26 }}>SBDMM</h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>5PL Logistics Marketplace</p>
        </div>

        <div className="card border-0 shadow-lg" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div className="card-body p-40">

            {submitted ? (
              /* ── Success state ── */
              <div className="text-center">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle mb-20"
                  style={{ width: 56, height: 56, background: '#f0fdf4' }}
                >
                  <i className="ph ph-envelope-simple-open" style={{ fontSize: 26, color: '#299E60' }} />
                </div>
                <h2 className="fw-bold mb-8" style={{ fontSize: 20, color: '#0f172a' }}>Watch your inbox</h2>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
                  If <strong>{email}</strong> is registered, a restoration link is on its way.
                  Check your spam folder if it doesn't arrive within a few minutes.
                </p>
                <Link
                  to="/login"
                  className="btn w-100 d-flex align-items-center justify-content-center gap-8"
                  style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, height: 46, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
                >
                  <i className="ph ph-arrow-left" />
                  Back to sign in
                </Link>
              </div>
            ) : (
              /* ── Request form ── */
              <>
                <h2 className="fw-bold mb-8" style={{ fontSize: 20, color: '#0f172a' }}>Restore your access</h2>
                <p className="text-muted mb-24" style={{ fontSize: 14 }}>
                  Enter your account email and we'll send you a restoration link.
                </p>

                <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
                  {error && (
                    <div role="alert" className="alert alert-danger d-flex align-items-center gap-8 py-10 px-16 mb-20" style={{ borderRadius: 8, fontSize: 14 }}>
                      <i className="ph ph-warning-circle" style={{ fontSize: 18, flexShrink: 0 }} />
                      {error}
                    </div>
                  )}

                  <div className="mb-24">
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

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn w-100 d-flex align-items-center justify-content-center gap-8"
                    style={{
                      background: '#299E60', color: '#fff', border: 'none',
                      borderRadius: 8, height: 46, fontSize: 15, fontWeight: 600,
                      opacity: isSubmitting ? 0.7 : 1,
                    }}
                  >
                    {isSubmitting ? (
                      <><span className="spinner-border spinner-border-sm" role="status" /> Sending…</>
                    ) : (
                      <><i className="ph ph-paper-plane-tilt" /> Send restoration link</>
                    )}
                  </button>
                </form>

                <p className="text-center mt-24 mb-0" style={{ fontSize: 13, color: '#94a3b8' }}>
                  Remember your password?{' '}
                  <Link to="/login" style={{ color: '#299E60', textDecoration: 'none', fontWeight: 600 }}>
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        <p className="text-center mt-20" style={{ fontSize: 12, color: '#475569' }}>
          © {new Date().getFullYear()} SBDMM. All rights reserved.
        </p>
      </div>
    </div>
  );
}
