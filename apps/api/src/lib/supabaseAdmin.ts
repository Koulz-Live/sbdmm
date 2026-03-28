/**
 * Supabase Admin Client — SERVER ONLY
 *
 * SECURITY MANDATES:
 * 1. This file uses the SERVICE ROLE KEY which bypasses ALL Row Level Security.
 *    It must NEVER be imported in frontend code.
 * 2. Any function using this client MUST perform its own authorization checks
 *    before calling Supabase — do not rely on RLS here.
 * 3. This client is for admin-initiated operations only: tenant provisioning,
 *    super_admin actions, background jobs, compliance automation.
 * 4. All usage MUST be audit-logged.
 *
 * HUMAN DECISION: Restrict usage of this client to /src/services/admin.ts
 * and /src/domains/tenant-provisioning. Do not spread it across the codebase.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

// Validate required environment variables at startup.
// Fail fast — do not let the server start with missing critical config.
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // Log at fatal level — this is a misconfiguration, not a runtime error
    logger.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return value;
}

const supabaseUrl = getRequiredEnv('SUPABASE_URL');
const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

// Singleton admin client — created once at module load
// SECURITY: Service role key is read from environment and never stored in source code
let _adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        // Disable auto-refresh — admin client uses service role, not user sessions
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          // Identify server-originated requests in Supabase logs
          'X-Application-Name': 'sbdmm-api-admin',
        },
      },
    });
  }
  return _adminClient;
}

/**
 * Creates a Supabase client scoped to a specific user's JWT.
 * This client RESPECTS Row Level Security — use it for user-context operations.
 * SECURITY: The JWT is verified by Supabase on every call.
 */
export function getUserScopedClient(userAccessToken: string): SupabaseClient {
  const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        'X-Application-Name': 'sbdmm-api-user',
      },
    },
  });
}
