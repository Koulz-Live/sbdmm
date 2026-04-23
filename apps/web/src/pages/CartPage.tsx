/**
 * CartPage — Shopping Cart, Coupon & Checkout
 *
 * Three views rendered in-page (no routing):
 *   1. Cart view   — list of items with qty steppers + remove, order summary sidebar
 *   2. Success view — order confirmation after checkout
 *
 * Features:
 *   - Quantity stepper (1–100) with optimistic update
 *   - Remove item with confirmation fade
 *   - Coupon code field with validation via POST /api/v1/cart/coupon/validate
 *   - Order summary: subtotal / discount / total
 *   - "Place Order" → POST /api/v1/cart/checkout
 *   - Items with no price (quote on request) shown with note, excluded from totals
 *   - Payment gateway placeholder banner
 *   - Order history panel
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useCart, type CartItem } from '../contexts/CartContext';

// ─── Visual helpers (shared with FurnitureFeedPage) ──────────────────────────

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
  'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
  'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)',
  'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
  'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)',
  'linear-gradient(135deg, #fbe9e7 0%, #ffccbc 100%)',
  'linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%)',
];

const FURNITURE_ICONS = ['ph-armchair', 'ph-couch', 'ph-bed', 'ph-table', 'ph-dresser', 'ph-door', 'ph-lamp', 'ph-bathtub'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function itemGradient(id: string): string {
  return CARD_GRADIENTS[hashStr(id) % CARD_GRADIENTS.length] ?? CARD_GRADIENTS[0]!;
}

function itemIcon(id: string): string {
  return FURNITURE_ICONS[hashStr(id) % FURNITURE_ICONS.length] ?? 'ph-armchair';
}

const MODE_ICONS: Record<string, string> = {
  FCL: 'ph-container', LCL: 'ph-package', AIR: 'ph-airplane',
  ROAD: 'ph-truck', RAIL: 'ph-train', COURIER: 'ph-lightning', OTHER: 'ph-cube',
};

// ─── Order history types ──────────────────────────────────────────────────────

interface OrderHistoryItem {
  id: string;
  items: {
    title: string;
    vendor_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    currency: string;
    service_mode: string;
  }[];
  subtotal: number;
  discount_pct: number;
  discount_amount: number;
  total: number;
  coupon_code: string | null;
  status: 'pending' | 'paid' | 'cancelled';
  currency: string;
  created_at: string;
}

// ─── Coupon state ─────────────────────────────────────────────────────────────

interface AppliedCoupon {
  code: string;
  discount_pct: number;
}

// ─── Cart Item Row ────────────────────────────────────────────────────────────

function CartItemRow({
  item,
  onRemove,
  onQtyChange,
}: {
  item: CartItem;
  onRemove: (id: string) => void;
  onQtyChange: (id: string, qty: number) => void;
}): React.JSX.Element {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async (): Promise<void> => {
    setRemoving(true);
    onRemove(item.id);
  };

  const lineTotal =
    item.base_price_amount !== null
      ? item.base_price_amount * item.quantity
      : null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '16px 0',
        borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
        opacity: removing ? 0.4 : 1,
        transition: 'opacity 0.2s',
        alignItems: 'flex-start',
      }}
    >
      {/* Visual thumbnail */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 12,
          background: itemGradient(item.catalogue_item_id),
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <i
          className={`ph ${itemIcon(item.catalogue_item_id)}`}
          style={{ fontSize: 32, color: 'rgba(0,0,0,0.18)' }}
        />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: 3, lineHeight: 1.35 }}>
          {item.title}
        </div>
        <div style={{ fontSize: 12, color: '#299E60', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ph ph-storefront" style={{ fontSize: 12 }} />
          {item.vendor_name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <i className={`ph ${MODE_ICONS[item.service_mode] ?? 'ph-cube'}`} style={{ fontSize: 12 }} />
            {item.service_mode}
          </span>
          {item.origin_region && (
            <>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span>{item.origin_region} → {item.destination_region}</span>
            </>
          )}
        </div>
      </div>

      {/* Qty + price + remove (right side) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        {/* Price */}
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #0f172a)', textAlign: 'right' }}>
          {lineTotal !== null
            ? `${item.base_price_currency} ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 12 }}>Quote on request</span>}
        </div>
        {item.base_price_amount !== null && item.quantity > 1 && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {item.base_price_currency} {item.base_price_amount.toLocaleString()} × {item.quantity}
          </div>
        )}

        {/* Qty stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '2px 4px' }}>
          <button
            onClick={() => { if (item.quantity > 1) onQtyChange(item.id, item.quantity - 1); }}
            disabled={item.quantity <= 1}
            style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer', color: item.quantity <= 1 ? '#cbd5e1' : '#374151', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
          >
            <i className="ph ph-minus" style={{ fontSize: 12 }} />
          </button>
          <span style={{ minWidth: 24, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
            {item.quantity}
          </span>
          <button
            onClick={() => { if (item.quantity < 100) onQtyChange(item.id, item.quantity + 1); }}
            disabled={item.quantity >= 100}
            style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: item.quantity >= 100 ? 'not-allowed' : 'pointer', color: item.quantity >= 100 ? '#cbd5e1' : '#374151', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
          >
            <i className="ph ph-plus" style={{ fontSize: 12 }} />
          </button>
        </div>

        {/* Remove */}
        <button
          onClick={() => { void handleRemove(); }}
          disabled={removing}
          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, padding: '2px 0' }}
        >
          <i className="ph ph-trash" style={{ fontSize: 12 }} />
          Remove
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CartPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { items, count, loading, removeItem, updateQty, clearCart, refresh } = useCart();

  // Coupon state
  const [couponInput, setCouponInput]       = useState('');
  const [appliedCoupon, setAppliedCoupon]   = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError]       = useState<string | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Checkout state
  const [checkingOut, setCheckingOut]     = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<OrderHistoryItem | null>(null);

  // Order history
  const [orders, setOrders]               = useState<OrderHistoryItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [showOrders, setShowOrders]       = useState(false);

  const loadOrders = useCallback(async (): Promise<void> => {
    setOrdersLoading(true);
    const res = await api.get<OrderHistoryItem[]>('/api/v1/cart/orders');
    if (res.success && res.data) setOrders(res.data);
    setOrdersLoading(false);
  }, []);

  useEffect(() => {
    if (showOrders) void loadOrders();
  }, [showOrders, loadOrders]);

  // ── Computed totals ─────────────────────────────────────────────────────────

  const pricedItems   = items.filter(i => i.base_price_amount !== null);
  const freeItems     = items.filter(i => i.base_price_amount === null);
  const subtotal      = pricedItems.reduce((s, i) => s + (i.base_price_amount! * i.quantity), 0);
  const discountPct   = appliedCoupon?.discount_pct ?? 0;
  const discountAmt   = Math.round(subtotal * discountPct / 100 * 100) / 100;
  const total         = Math.max(0, Math.round((subtotal - discountAmt) * 100) / 100);
  const currency      = items[0]?.base_price_currency ?? 'USD';

  // ── Coupon ──────────────────────────────────────────────────────────────────

  const handleApplyCoupon = async (): Promise<void> => {
    if (!couponInput.trim()) return;
    setValidatingCoupon(true);
    setCouponError(null);
    const res = await api.post<{ code: string; discount_pct: number }>(
      '/api/v1/cart/coupon/validate',
      { code: couponInput.trim() },
    );
    setValidatingCoupon(false);
    if (res.success && res.data) {
      setAppliedCoupon({ code: res.data.code, discount_pct: res.data.discount_pct });
      setCouponInput('');
    } else {
      setCouponError(
        (res.error as { message?: string } | undefined)?.message ?? 'Invalid coupon code.',
      );
    }
  };

  const handleRemoveCoupon = (): void => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  };

  // ── Checkout ────────────────────────────────────────────────────────────────

  const handleCheckout = async (): Promise<void> => {
    setCheckingOut(true);
    setCheckoutError(null);
    const res = await api.post<OrderHistoryItem>('/api/v1/cart/checkout', {
      coupon_code: appliedCoupon?.code ?? undefined,
    });
    setCheckingOut(false);
    if (res.success && res.data) {
      setCompletedOrder(res.data);
      setAppliedCoupon(null);
      await refresh(); // Clear context
    } else {
      setCheckoutError(
        (res.error as { message?: string } | undefined)?.message ?? 'Checkout failed. Please try again.',
      );
    }
  };

  // ── Success view ────────────────────────────────────────────────────────────

  if (completedOrder) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <style>{`@keyframes pop { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }`}</style>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: '#f0fdf4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', animation: 'pop 0.4s ease forwards',
        }}>
          <i className="ph-fill ph-check-circle" style={{ fontSize: 48, color: '#299E60' }} />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary, #0f172a)', marginBottom: 8 }}>
          Order Placed!
        </h2>
        <p style={{ color: 'var(--text-muted, #64748b)', fontSize: 14, marginBottom: 24 }}>
          Your order <strong>#{completedOrder.id.slice(0, 8).toUpperCase()}</strong> has been confirmed.
          {completedOrder.status === 'paid' && ' No payment required — 100% discount applied.'}
        </p>

        {/* Order summary card */}
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: 16, padding: 20, marginBottom: 24, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary, #64748b)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Order Summary
          </div>
          {completedOrder.items.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-primary, #0f172a)', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span>{it.title} <span style={{ color: '#94a3b8' }}>×{it.quantity}</span></span>
              <span style={{ fontWeight: 600 }}>
                {it.unit_price === 0 ? <span style={{ color: '#94a3b8' }}>Quoted</span> : `${it.currency} ${it.line_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
            <span>Total</span>
            <span style={{ color: '#299E60' }}>
              {completedOrder.total === 0 ? 'Free' : `${completedOrder.currency} ${completedOrder.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            </span>
          </div>
          {completedOrder.coupon_code && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#299E60', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ph ph-tag" /> Coupon <strong>{completedOrder.coupon_code}</strong> applied ({completedOrder.discount_pct}% off)
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/home')}
            style={{ padding: '10px 24px', background: '#299E60', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            <i className="ph ph-storefront me-6" />
            Continue Shopping
          </button>
          <button
            onClick={() => { setCompletedOrder(null); setShowOrders(true); }}
            style={{ padding: '10px 24px', background: 'transparent', color: 'var(--text-secondary, #64748b)', border: '1.5px solid var(--border-subtle, #e2e8f0)', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            <i className="ph ph-clock-clockwise me-6" />
            View Order History
          </button>
        </div>
      </div>
    );
  }

  // ── Order history view ──────────────────────────────────────────────────────

  if (showOrders) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 0 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => setShowOrders(false)}
            style={{ background: 'none', border: 'none', color: '#299E60', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}
          >
            <i className="ph ph-arrow-left" /> Back to Cart
          </button>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary, #0f172a)', marginBottom: 20 }}>
          <i className="ph ph-clock-clockwise me-8" style={{ color: '#299E60' }} />
          Order History
        </h2>

        {ordersLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
            <i className="ph ph-circle-notch" style={{ fontSize: 28, display: 'block', marginBottom: 8, animation: 'spin 1s linear infinite' }} />
            Loading…
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
            <i className="ph ph-receipt" style={{ fontSize: 48, display: 'block', marginBottom: 12, color: '#cbd5e1' }} />
            No orders yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.map(order => (
              <div key={order.id} style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                borderRadius: 14,
                padding: 20,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #0f172a)', fontFamily: 'monospace' }}>
                      #{order.id.slice(0, 8).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {new Date(order.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      {' · '}
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {order.coupon_code && (
                      <span style={{ fontSize: 11, background: '#f0fdf4', color: '#299E60', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 8px', fontWeight: 700 }}>
                        <i className="ph ph-tag me-4" />{order.coupon_code}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                      background: order.status === 'paid' ? '#f0fdf4' : order.status === 'cancelled' ? '#fef2f2' : '#fffbeb',
                      color: order.status === 'paid' ? '#15803d' : order.status === 'cancelled' ? '#b91c1c' : '#d97706',
                    }}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', marginBottom: 10 }}>
                  {order.items.map(i => i.title).join(', ')}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: 'var(--text-secondary, #64748b)' }}>Total</span>
                  <span style={{ color: order.total === 0 ? '#299E60' : 'var(--text-primary, #0f172a)' }}>
                    {order.total === 0 ? 'Free' : `${order.currency} ${order.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Empty cart ──────────────────────────────────────────────────────────────

  if (!loading && items.length === 0) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <i className="ph ph-shopping-cart-simple" style={{ fontSize: 64, color: '#cbd5e1', display: 'block', marginBottom: 16 }} />
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #0f172a)', marginBottom: 8 }}>Your cart is empty</h2>
        <p style={{ color: 'var(--text-muted, #64748b)', fontSize: 14, marginBottom: 28 }}>
          Browse the marketplace and add items to your cart.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/home')}
            style={{ padding: '10px 24px', background: '#299E60', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ph ph-storefront" />
            Browse Marketplace
          </button>
          {orders.length > 0 && (
            <button
              onClick={() => setShowOrders(true)}
              style={{ padding: '10px 24px', background: 'transparent', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              <i className="ph ph-clock-clockwise me-6" />
              Order History
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Main cart view ──────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 48px' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .cart-checkout-btn:hover:not(:disabled) { background: #1e7a49 !important; }
        .cart-coupon-btn:hover:not(:disabled) { background: #f8fafc !important; border-color: #94a3b8 !important; }
      `}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #0f172a)', margin: 0 }}>
            <i className="ph ph-shopping-cart-simple me-8" style={{ color: '#299E60' }} />
            Your Cart
            <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', marginLeft: 10 }}>
              {count} item{count !== 1 ? 's' : ''}
            </span>
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setShowOrders(true); void loadOrders(); }}
            style={{ padding: '7px 14px', background: 'transparent', color: 'var(--text-secondary, #64748b)', border: '1.5px solid var(--border-subtle, #e2e8f0)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <i className="ph ph-clock-clockwise" /> History
          </button>
          <button
            onClick={() => navigate('/home')}
            style={{ padding: '7px 14px', background: 'transparent', color: '#299E60', border: '1.5px solid #299E60', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <i className="ph ph-storefront" /> Keep Shopping
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Cart items ────────────────────────────────────────────── */}
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: 16, padding: '8px 24px 0' }}>
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
              <i className="ph ph-circle-notch" style={{ fontSize: 28, display: 'block', marginBottom: 8, animation: 'spin 1s linear infinite' }} />
              Loading cart…
            </div>
          ) : (
            <>
              {items.map(item => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  onRemove={id => { void removeItem(id); }}
                  onQtyChange={(id, qty) => { void updateQty(id, qty); }}
                />
              ))}

              {/* Quote on request notice */}
              {freeItems.length > 0 && (
                <div style={{
                  margin: '16px 0',
                  padding: '10px 14px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}>
                  <i className="ph ph-info" style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }} />
                  <span>
                    {freeItems.length} item{freeItems.length > 1 ? 's' : ''} ({freeItems.map(i => i.title).join(', ')})
                    {freeItems.length > 1 ? ' are' : ' is'} priced on request and excluded from the total. A vendor will contact you after order placement.
                  </span>
                </div>
              )}

              {/* Clear cart link */}
              <div style={{ padding: '12px 0', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { void clearCart(); }}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <i className="ph ph-trash" /> Clear cart
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Order summary ────────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary, #0f172a)', marginBottom: 16 }}>
              Order Summary
            </div>

            {/* Subtotal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary, #64748b)', marginBottom: 8 }}>
              <span>Subtotal ({count} item{count !== 1 ? 's' : ''})</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                {pricedItems.length > 0
                  ? `${currency} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : '—'}
              </span>
            </div>

            {/* Coupon field */}
            <div style={{ margin: '14px 0 10px', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary, #64748b)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ph ph-tag" /> Coupon Code
              </div>

              {appliedCoupon ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#299E60', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ph ph-check-circle" />
                    {appliedCoupon.code} ({appliedCoupon.discount_pct}% off)
                  </span>
                  <button
                    onClick={handleRemoveCoupon}
                    style={{ background: 'none', border: 'none', color: '#299E60', cursor: 'pointer', fontSize: 16, padding: 2 }}
                    title="Remove coupon"
                  >
                    <i className="ph ph-x" />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') void handleApplyCoupon(); }}
                      placeholder="e.g. FULL100"
                      style={{
                        flex: 1, padding: '8px 10px', border: `1.5px solid ${couponError ? '#fca5a5' : '#e2e8f0'}`,
                        borderRadius: 8, fontSize: 13, color: '#0f172a', letterSpacing: '0.05em',
                        textTransform: 'uppercase', background: '#fff',
                      }}
                    />
                    <button
                      onClick={() => { void handleApplyCoupon(); }}
                      disabled={validatingCoupon || !couponInput.trim()}
                      className="cart-coupon-btn"
                      style={{
                        padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8,
                        background: '#f8fafc', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap', transition: 'border-color 0.15s, background 0.15s',
                        opacity: validatingCoupon || !couponInput.trim() ? 0.5 : 1,
                      }}
                    >
                      {validatingCoupon ? <i className="ph ph-circle-notch" style={{ animation: 'spin 1s linear infinite' }} /> : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <p style={{ fontSize: 11, color: '#ef4444', marginTop: 5, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="ph ph-warning-circle" /> {couponError}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 5, marginBottom: 0 }}>
                    Try <strong>FULL100</strong> for 100% off
                  </p>
                </>
              )}
            </div>

            {/* Discount line */}
            {appliedCoupon && discountAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#299E60', fontWeight: 600, marginBottom: 8 }}>
                <span>Discount ({appliedCoupon.discount_pct}%)</span>
                <span>− {currency} {discountAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {/* Total */}
            <div style={{ borderTop: '1.5px solid #e2e8f0', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: appliedCoupon && total === 0 ? '#299E60' : 'var(--text-primary, #0f172a)' }}>
                {appliedCoupon && total === 0
                  ? 'Free'
                  : pricedItems.length > 0
                    ? `${currency} ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : '—'}
              </span>
            </div>

            {/* Checkout button */}
            {checkoutError && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#b91c1c', display: 'flex', gap: 6, alignItems: 'center' }}>
                <i className="ph ph-warning-circle" /> {checkoutError}
              </div>
            )}

            <button
              onClick={() => { void handleCheckout(); }}
              disabled={checkingOut || items.length === 0}
              className="cart-checkout-btn"
              style={{
                marginTop: 16, width: '100%', padding: '12px',
                background: '#299E60', color: '#fff', border: 'none',
                borderRadius: 10, fontWeight: 800, fontSize: 15,
                cursor: checkingOut || items.length === 0 ? 'not-allowed' : 'pointer',
                opacity: checkingOut || items.length === 0 ? 0.7 : 1,
                transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {checkingOut
                ? <><i className="ph ph-circle-notch" style={{ animation: 'spin 1s linear infinite' }} /> Placing Order…</>
                : <><i className="ph ph-lock-simple" /> Place Order</>}
            </button>

            {/* Payment gateway note */}
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: 'var(--bg-app, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: 8, fontSize: 11, color: 'var(--text-muted, #94a3b8)',
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <i className="ph ph-credit-card" style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }} />
              <span>
                Secure payment gateway integration coming soon. Use coupon <strong>FULL100</strong> for 100% discount on test orders.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
