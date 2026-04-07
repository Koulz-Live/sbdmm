/**
 * ErrorBoundary — Catches unhandled React render errors.
 *
 * Prevents a single crashed subtree from taking down the whole app.
 * Shows a friendly recovery screen instead of a blank white page.
 *
 * USAGE:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 * Or wrap the entire app root in main.tsx.
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback — rendered when the boundary catches an error */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'An unexpected error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console in development; swap for a real error tracking service in production.
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="d-flex flex-column align-items-center justify-content-center text-center"
          style={{ minHeight: '100vh', padding: 32, background: '#f1f5f9' }}
          role="alert"
        >
          <div
            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-20"
            style={{ width: 72, height: 72, background: '#fef2f2' }}
          >
            <i className="ph ph-warning-circle" style={{ fontSize: 36, color: '#b91c1c' }} />
          </div>

          <h1 className="fw-bold mb-8" style={{ fontSize: 24, color: '#0f172a' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', maxWidth: 420, lineHeight: 1.7, marginBottom: 24 }}>
            An unexpected error occurred in the application. You can try refreshing the page or
            returning to the dashboard.
          </p>

          {/* Show message in dev (NODE_ENV check at build time) */}
          {import.meta.env.DEV && this.state.errorMessage && (
            <pre
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 12,
                textAlign: 'left',
                maxWidth: 560,
                width: '100%',
                overflow: 'auto',
                marginBottom: 24,
              }}
            >
              {this.state.errorMessage}
            </pre>
          )}

          <div className="d-flex gap-12 flex-wrap justify-content-center">
            <button
              onClick={this.handleReset}
              className="btn d-flex align-items-center gap-8"
              style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}
            >
              <i className="ph ph-arrows-clockwise" />
              Try again
            </button>
            <a
              href="/"
              className="btn d-flex align-items-center gap-8"
              style={{ background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 20px', fontWeight: 500, fontSize: 14 }}
            >
              <i className="ph ph-house" />
              Go home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
