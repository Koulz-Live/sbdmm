/**
 * CartContext — Global Shopping Cart State
 *
 * Provides cart items, count, and CRUD operations to the whole app.
 * The cart is persisted in the database (cart_items table) so it survives
 * page refreshes and is consistent across devices.
 *
 * USAGE:
 *   Wrap the app with <CartProvider> (in main.tsx, inside AuthProvider).
 *   Access via useCart() in any component.
 *
 * PATTERN:
 *   - Optimistic UI for remove/qty changes (instant feedback)
 *   - Server-confirmed state after each mutation (refresh after add)
 *   - Cart only loads when user is authenticated
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/apiClient';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CartItem {
  id: string;                      // cart_items row PK
  catalogue_item_id: string;
  vendor_id: string;
  vendor_name: string;
  title: string;
  base_price_amount: number | null; // null = quote on request
  base_price_currency: string;
  price_unit: string | null;
  service_mode: string;
  origin_region: string;
  destination_region: string;
  quantity: number;
  created_at: string;
}

export interface AddToCartPayload {
  catalogue_item_id: string;
  vendor_id: string;
  vendor_name: string;
  title: string;
  base_price_amount?: number | null;
  base_price_currency?: string;
  price_unit?: string | null;
  service_mode?: string;
  origin_region?: string;
  destination_region?: string;
}

interface CartContextValue {
  items: CartItem[];
  /** Total quantity across all line items */
  count: number;
  loading: boolean;
  /**
   * Add an item to the cart (server upsert — increments qty if already present).
   * Returns true on success, false on failure.
   */
  addItem: (payload: AddToCartPayload) => Promise<boolean>;
  /** Remove a single cart item row by its cart_items PK */
  removeItem: (cartItemId: string) => Promise<void>;
  /** Update the quantity of a single cart item (1–100) */
  updateQty: (cartItemId: string, qty: number) => Promise<void>;
  /** Delete all cart items for the current user */
  clearCart: () => Promise<void>;
  /** Re-fetch cart from server */
  refresh: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }
    setLoading(true);
    const res = await api.get<CartItem[]>('/api/v1/cart');
    if (res.success && res.data) setItems(res.data);
    setLoading(false);
  }, [isAuthenticated]);

  // Load cart when user authenticates (or re-authenticates)
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── addItem ─────────────────────────────────────────────────────────────────

  const addItem = useCallback(async (payload: AddToCartPayload): Promise<boolean> => {
    const res = await api.post<CartItem>('/api/v1/cart', payload);
    if (res.success && res.data) {
      // Optimistic: update local state immediately with the returned row
      setItems(prev => {
        const exists = prev.find(i => i.catalogue_item_id === payload.catalogue_item_id);
        if (exists) {
          // qty-increment case — update in place
          return prev.map(i => i.catalogue_item_id === payload.catalogue_item_id ? res.data! : i);
        }
        return [...prev, res.data!];
      });
      // Then confirm with a server refresh (handles edge cases)
      void refresh();
      return true;
    }
    return false;
  }, [refresh]);

  // ── removeItem ──────────────────────────────────────────────────────────────

  const removeItem = useCallback(async (cartItemId: string): Promise<void> => {
    // Optimistic: remove from local state immediately
    setItems(prev => prev.filter(i => i.id !== cartItemId));
    await api.delete(`/api/v1/cart/${cartItemId}`);
    // No need to refresh — optimistic update is correct
  }, []);

  // ── updateQty ───────────────────────────────────────────────────────────────

  const updateQty = useCallback(async (cartItemId: string, qty: number): Promise<void> => {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === cartItemId ? { ...i, quantity: qty } : i));
    await api.patch(`/api/v1/cart/${cartItemId}`, { quantity: qty });
  }, []);

  // ── clearCart ───────────────────────────────────────────────────────────────

  const clearCart = useCallback(async (): Promise<void> => {
    setItems([]);
    await api.delete('/api/v1/cart');
  }, []);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, count, loading, addItem, removeItem, updateQty, clearCart, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
