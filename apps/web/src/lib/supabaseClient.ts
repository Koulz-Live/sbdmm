/// <reference types="vite/client" />

/**
 * Supabase Browser Client — PUBLIC ONLY
 *
 * SECURITY MANDATES:
 * 1. This client uses ONLY the ANON KEY — safe for browser exposure
 * 2. The anon key is restricted by Row Level Security policies
 * 3. NEVER import or use the service role key in this file or anywhere in /apps/web
 * 4. All sensitive operations (AI, admin, compliance) go through the Express API
 * 5. This client is for: auth, reading user-scoped data, realtime subscriptions
 *
 * The anon key is NOT a secret — it is intentionally public.
 * Security comes from Supabase Auth (JWT verification) and RLS policies.
 */

import { createClient } from '@supabase/supabase-js';

// SECURITY: Only VITE_* env vars are available in the browser.
// These are intentionally public-facing values.
const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[SBDMM] Missing Supabase configuration. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Store session in localStorage (default) — acceptable for browser apps
    // HUMAN DECISION: Consider sessionStorage for higher-security scenarios
    // where you don't want the session to persist across browser close.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
