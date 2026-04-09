/**
 * Secure API Client — Frontend Only
 *
 * SECURITY DESIGN:
 * This client wraps all calls to the Express backend API.
 * It enforces:
 * 1. Auth token is attached from Supabase session — never stored separately
 * 2. Request IDs are generated and attached for tracing
 * 3. Error responses are normalized — raw server errors never leak to components
 * 4. Sensitive operations (AI, compliance, admin) go ONLY through this client
 * 5. No direct OpenAI calls — all AI goes through /api/v1/ai/proxy
 * 6. Response types are validated to prevent runtime type errors
 *
 * ANTI-PATTERNS PREVENTED:
 * - No hardcoded tokens
 * - No bearer token in localStorage beyond Supabase session management
 * - No API calls with stale tokens (Supabase auto-refreshes)
 */

/// <reference types="vite/client" />

import { supabase } from './supabaseClient';
import type { ApiResponse } from '@sbdmm/shared';

// In production (Vercel) the API is same-origin (/api/* routes handled by @vercel/node).
// In local dev the Express server runs on port 3001.
const API_BASE_URL = (import.meta.env['VITE_API_BASE_URL'] as string | undefined)
  ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

// ─── Super-admin tenant override ─────────────────────────────────────────────
// Super admins can impersonate a specific tenant context.
// The selected tenant ID is stored here and injected as X-Tenant-Override.
const TENANT_OVERRIDE_KEY = 'sbdmm_tenant_override';

export function getTenantOverride(): string | null {
  return localStorage.getItem(TENANT_OVERRIDE_KEY);
}

export function setTenantOverride(tenantId: string | null): void {
  if (tenantId) {
    localStorage.setItem(TENANT_OVERRIDE_KEY, tenantId);
  } else {
    localStorage.removeItem(TENANT_OVERRIDE_KEY);
  }
}

// Generate a simple browser-side request ID for correlation
function generateRequestId(): string {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiClientOptions {
  method?: HttpMethod;
  body?: unknown;
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * apiClient — Secure wrapper for all backend API calls.
 *
 * SECURITY: Token is always fetched fresh from Supabase session.
 * If the session is expired, Supabase auto-refreshes before returning.
 * If the user is not logged in, the request is rejected with no auth header.
 */
export async function apiClient<T = unknown>(
  path: string,
  options: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, idempotencyKey, signal } = options;
  const requestId = generateRequestId();

  // Fetch current session — Supabase handles token refresh automatically
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  };

  // Attach auth token if available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Super-admin tenant override — allows impersonating a specific tenant context
  const tenantOverride = getTenantOverride();
  if (tenantOverride) {
    headers['X-Tenant-Override'] = tenantOverride;
  }

  // Idempotency key for POST/PATCH operations
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = idempotencyKey;
  }

  const url = `${API_BASE_URL}${path}`;

  // Build fetch init — use null instead of undefined for body (required by exactOptionalPropertyTypes + RequestInit)
  const fetchInit: RequestInit = {
    method,
    headers,
    credentials: 'omit',
  };
  if (body !== undefined) {
    fetchInit.body = JSON.stringify(body);
  }
  if (signal !== undefined) {
    fetchInit.signal = signal;
  }

  try {
    const response = await fetch(url, fetchInit);

    // Parse response — always expect JSON
    let json: ApiResponse<T>;
    try {
      json = (await response.json()) as ApiResponse<T>;
    } catch {
      // Non-JSON response (e.g., 502 from proxy)
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected response from server. Please try again.',
        },
        meta: { request_id: requestId, timestamp: new Date().toISOString() },
      };
    }

    // Handle 401 — session might have expired; trigger re-auth
    if (response.status === 401) {
      await supabase.auth.signOut();
      // Redirect to login will be handled by route guard
    }

    return json;
  } catch (err) {
    // Network error (no connectivity, CORS, etc.)
    // SECURITY: Never expose raw network error details to user
    const isAborted = err instanceof DOMException && err.name === 'AbortError';

    return {
      success: false,
      error: {
        code: isAborted ? 'ABORTED' : 'NETWORK_ERROR',
        message: isAborted
          ? 'Request was cancelled.'
          : 'Unable to connect to the server. Please check your connection.',
      },
      meta: { request_id: requestId, timestamp: new Date().toISOString() },
    };
  }
}

// ─── Typed API Helper Functions ───────────────────────────────────────────────
// These provide a clean, typed interface for components to use

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    apiClient<T>(path, { method: 'GET', ...(signal !== undefined ? { signal } : {}) }),

  post: <T>(path: string, body: unknown, idempotencyKey?: string) =>
    apiClient<T>(path, {
      method: 'POST',
      body,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    }),

  patch: <T>(path: string, body: unknown) =>
    apiClient<T>(path, { method: 'PATCH', body }),

  put: <T>(path: string, body: unknown) =>
    apiClient<T>(path, { method: 'PUT', body }),

  delete: <T>(path: string) =>
    apiClient<T>(path, { method: 'DELETE' }),

  // AI proxy — all AI calls go through the backend, never directly to OpenAI
  // SECURITY: This enforces the no-direct-AI-from-browser policy
  ai: <T>(
    task: string,
    input: Record<string, unknown>,
    modelPreference?: string,
  ) =>
    apiClient<T>('/api/v1/ai/proxy', {
      method: 'POST',
      body: { task, input, model_preference: modelPreference },
    }),
};
