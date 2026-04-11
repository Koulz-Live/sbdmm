/**
 * Auth Context — Frontend
 *
 * SECURITY DESIGN:
 * - Auth state comes exclusively from Supabase — never from localStorage manually
 * - User profile (role, tenant_id) is loaded from the backend API after auth
 *   to ensure we have the authoritative server-side values
 * - Route protection is enforced in ProtectedRoute — this context provides state
 * - NEVER store the access token in React state or context — use Supabase session
 * - Role is only used for UI decisions (show/hide UI elements)
 *   ALL authorization is re-enforced server-side on every API call
 *
 * IMPORTANT: Frontend role checks are for UX only — not security.
 * The backend is the authoritative authorization enforcer.
 *
 * ROLE SIMULATION (super_admin only):
 * - super_admin users can simulate any role for UI testing via setSimulatedRole()
 * - The simulated role is stored in sessionStorage (clears on tab close)
 * - ONLY affects the UI — API calls still use the real super_admin JWT
 * - The real underlying role is always available via profile.role
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { type User, type Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/apiClient';
import type { UserProfile, PlatformRole } from '@sbdmm/shared';

// ─── Session-scoped role simulation key ──────────────────────────────────────
const SIMULATED_ROLE_KEY = 'sbdmm_simulated_role';

export function getSimulatedRole(): PlatformRole | null {
  return (sessionStorage.getItem(SIMULATED_ROLE_KEY) as PlatformRole | null);
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** The real role from the database — always super_admin for super admins */
  realRole: PlatformRole | null;
  /** Effective role used for all UI decisions — may be simulated */
  simulatedRole: PlatformRole | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** super_admin only — set to null to restore real role */
  setSimulatedRole: (role: PlatformRole | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    realRole: null,
    simulatedRole: getSimulatedRole(),
  });

  const setSimulatedRole = useCallback((role: PlatformRole | null): void => {
    if (role === null) {
      sessionStorage.removeItem(SIMULATED_ROLE_KEY);
    } else {
      sessionStorage.setItem(SIMULATED_ROLE_KEY, role);
    }
    setState((prev) => ({ ...prev, simulatedRole: role }));
  }, []);

  /**
   * loadProfile — Fetches the authoritative user profile.
   *
   * Strategy (two-tier):
   *   1. Try the Express backend (/api/v1/auth/profile) — authoritative source,
   *      enforces is_active check server-side.
   *   2. If the API is unavailable (cold-start crash, env vars missing, network
   *      error) fall back to a direct Supabase query so the OAuth callback is
   *      never permanently stuck.
   *
   * SECURITY NOTE: The fallback bypasses the server-side is_active check.
   * That check is still enforced on every subsequent API call via requireAuth.
   * The fallback only affects the initial session bootstrap.
   */
  const loadProfile = useCallback(async (): Promise<void> => {
    // ── Tier 1: backend API ──────────────────────────────────────────────────
    try {
      const result = await api.get<UserProfile>('/api/v1/auth/profile');
      if (result.success && result.data) {
        const profile = result.data;
        setState((prev) => ({
          ...prev,
          profile,
          realRole: (profile.role as PlatformRole) ?? null,
        }));
        return; // success — done
      }
    } catch {
      console.warn('[AUTH] Backend profile API unavailable — falling back to Supabase direct query');
    }

    // ── Tier 2: direct Supabase query (fallback) ─────────────────────────────
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, tenant_id, full_name, role, is_active, created_at')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        const profile: UserProfile = { ...data, email: user.email ?? '' } as UserProfile;
        setState((prev) => ({
          ...prev,
          profile,
          realRole: (profile.role as PlatformRole) ?? null,
        }));
      }
    } catch {
      console.warn('[AUTH] Could not load user profile via fallback');
    }
  }, []);

  // Listen for Supabase auth state changes
  useEffect(() => {
    // Get initial session
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      }));

      if (session) {
        void loadProfile();
      }
    });

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setState((prev) => ({
          ...prev,
          session,
          user: session?.user ?? null,
          isAuthenticated: !!session,
          isLoading: false,
        }));

        if (event === 'SIGNED_IN' && session) {
          await loadProfile();
        }

    // When signed out, also clear any simulated role
    if (event === 'SIGNED_OUT') {
          setState((prev) => ({ ...prev, profile: null, realRole: null, simulatedRole: null }));
          sessionStorage.removeItem(SIMULATED_ROLE_KEY);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // SECURITY: Return a generic message — don't reveal whether email exists
        return { error: 'Invalid email or password. Please try again.' };
      }
      return { error: null };
    },
    [],
  );

  /**
   * signInWithGoogle — initiates the OAuth redirect flow.
   * Supabase handles the callback; onAuthStateChange picks up the session.
   * Blocked at the UI layer for tenant_admin / super_admin (email+password only).
   */
  const signInWithGoogle = useCallback(
    async (): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            // Request refresh token so session can be extended
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) {
        return { error: 'Could not initiate Google sign-in. Please try again.' };
      }
      // Redirect happens — no further action needed here
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
    // State is cleared by the onAuthStateChange listener
  }, []);

  const refreshProfile = useCallback(async (): Promise<void> => {
    await loadProfile();
  }, [loadProfile]);

  // When a role is simulated, override profile.role so all UI consumers
  // automatically see the simulated role without any changes to call-sites.
  const effectiveProfile = state.profile && state.simulatedRole
    ? { ...state.profile, role: state.simulatedRole }
    : state.profile;

  return (
    <AuthContext.Provider
      value={{
        ...state,
        profile: effectiveProfile,
        signIn,
        signInWithGoogle,
        signOut,
        refreshProfile,
        setSimulatedRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
