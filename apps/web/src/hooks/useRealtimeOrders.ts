/**
 * useRealtimeOrders — Supabase Realtime Hook
 *
 * SECURITY DESIGN:
 * 1. Channel filter is applied by tenant_id — users only receive their tenant's events
 * 2. The underlying Supabase RLS still applies — the subscription only reaches
 *    rows the authenticated user is permitted to see
 * 3. On cleanup (unmount), the channel is explicitly removed to prevent leaks
 * 4. Type-safe payload parsing — malformed events are silently ignored
 *
 * USAGE:
 *   const { orders, isConnected } = useRealtimeOrders();
 *
 * HUMAN DECISION: Enable Supabase Realtime on the `orders` table in the
 * Supabase dashboard under Database → Replication → Realtime before using this hook.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import type { Order } from '@sbdmm/shared';

export type RealtimeOrderEvent = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  order: Order;
};

interface UseRealtimeOrdersReturn {
  /** Latest snapshot of orders updated via realtime (merges with initial page data) */
  realtimeEvents: RealtimeOrderEvent[];
  isConnected: boolean;
  /** Clears accumulated realtime events (call after re-fetching full list) */
  clearEvents: () => void;
}

export function useRealtimeOrders(): UseRealtimeOrdersReturn {
  const { profile } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeOrderEvent[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const clearEvents = useCallback(() => setRealtimeEvents([]), []);

  useEffect(() => {
    if (!profile?.tenant_id) return;

    // SECURITY: Channel name includes tenant_id to logically namespace subscriptions
    // Supabase RLS on the orders table provides the actual security boundary
    const channelName = `orders:tenant:${profile.tenant_id}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',             // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'orders',
          // Server-side filter: only receive events for this tenant
          filter: `tenant_id=eq.${profile.tenant_id}`,
        },
        (payload) => {
          // Type-safe payload parsing — ignore malformed events
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE' | undefined;
          if (!eventType) return;

          // For DELETE events, the new record is empty — use old
          const record = (payload.new && Object.keys(payload.new).length > 0)
            ? payload.new
            : payload.old;

          if (!record || typeof record !== 'object') return;

          const order = record as unknown as Order;
          if (!order.id || !order.tenant_id) return; // Basic shape guard

          setRealtimeEvents((prev) => [
            { eventType, order },
            // Keep last 50 events to avoid unbounded growth
            ...prev.slice(0, 49),
          ]);
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [profile?.tenant_id]);

  return { realtimeEvents, isConnected, clearEvents };
}
