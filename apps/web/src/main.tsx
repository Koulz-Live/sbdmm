/**
 * main.tsx — Application Entry Point
 *
 * SECURITY NOTE:
 * - StrictMode is intentionally ON — surfaces deprecated patterns and double-invokes effects in dev
 * - AuthProvider wraps everything — no route can access auth state outside this boundary
 * - No sensitive data is logged or stored at this level
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
// MONITORING: Must be the first side-effectful import so Sentry instruments fetch/XHR
import './lib/monitoring';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    '[FATAL] Root element #root not found. Check index.html. App cannot mount.',
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
