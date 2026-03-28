/**
 * LoginPage.tsx — Secure Authentication Page
 *
 * SECURITY DESIGN:
 * - Generic error message — never reveals if email exists or not
 * - No password autocomplete disabled (allowing password managers is GOOD security)
 * - Rate limiting is enforced on the backend (authRateLimit middleware)
 * - Post-login redirect respects the original destination (state.from) from react-router
 * - No credentials stored in component state longer than needed
 * - CSRF is not needed here — Supabase uses bearer tokens (stateless), no cookies for auth
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from './LoginPage.module.css';

interface LocationState {
  from?: { pathname: string };
}

export default function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const locationState = location.state as LocationState | null;
  const from = locationState?.from?.pathname ?? '/dashboard';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);

    // Basic client-side validation (backend validates authoritatively)
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        // Generic message — AuthContext intentionally obscures the real error
        setError(result.error);
      }
      // On success, the useEffect above handles redirect via isAuthenticated change
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div aria-live="polite" aria-busy="true" className={styles.loading}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>5PL Marketplace</h1>
          <p className={styles.subtitle}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {error && (
            <div role="alert" className={styles.errorBanner}>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
              aria-describedby={error ? 'login-error' : undefined}
              className={styles.input}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={styles.input}
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={styles.submitButton}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className={styles.footer}>
          Having trouble?{' '}
          <a href="mailto:support@sbdmm.io" className={styles.link}>
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
