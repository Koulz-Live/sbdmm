/**
 * ProductDetailPage — Full product detail view for a catalogue item.
 *
 * Route: /home/item/:id
 * Accessed by clicking any card on the /home feed.
 *
 * Shows:
 *  - Hero image / gradient visual
 *  - Title, vendor, route, service mode, transit time
 *  - Full description
 *  - Price & unit
 *  - Tags
 *  - Add to Cart + Save to Wishlist actions
 *  - Vendor info card with link to vendor profile
 *  - Back to feed navigation
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useCart } from '../contexts/CartContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorInfo {
  id: string;
  company_name: string;
  country_of_registration: string;
  business_category: string;
  website_url: string | null;
}

interface CatalogueItem {
  id: string;
  vendor_id: string;
  title: string;
  description: string | null;
  service_mode: string;
  origin_region: string;
  destination_region: string;
  transit_days_min: number;
  transit_days_max: number;
  base_price_amount: number | null;
  base_price_currency: string;
  price_unit: string;
  tags: string[];
  save_count: number;
  media_urls: string[];
  created_at: string;
  updated_at?: string;
  vendors: VendorInfo;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const GRADIENTS = [
  'linear-gradient(135deg,#e0f2fe,#bae6fd)',
  'linear-gradient(135deg,#dcfce7,#bbf7d0)',
  'linear-gradient(135deg,#fef9c3,#fde68a)',
  'linear-gradient(135deg,#fce7f3,#fbcfe8)',
  'linear-gradient(135deg,#ede9fe,#ddd6fe)',
  'linear-gradient(135deg,#ffedd5,#fed7aa)',
  'linear-gradient(135deg,#d1fae5,#a7f3d0)',
  'linear-gradient(135deg,#e0e7ff,#c7d2fe)',
];
const ICONS = [
  'ph-armchair','ph-bed','ph-table','ph-lamp','ph-package',
  'ph-tree','ph-paint-brush','ph-fork-knife','ph-briefcase','ph-cube',
];

const cardGradient = (id: string) => GRADIENTS[hashStr(id) % GRADIENTS.length];
const cardIcon     = (id: string) => ICONS[hashStr(id + 'i') % ICONS.length];

const MODE_ICONS: Record<string, string> = {
  FCL: 'ph-container', LCL: 'ph-package', AIR: 'ph-airplane',
  ROAD: 'ph-truck', RAIL: 'ph-train', COURIER: 'ph-lightning', OTHER: 'ph-cube',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem, items: cartItems } = useCart();

  const [item, setItem]       = useState<CatalogueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [addingCart, setAddingCart]     = useState(false);
  const [cartSuccess, setCartSuccess]   = useState(false);
  const [cartError, setCartError]       = useState<string | null>(null);
  const [activeImage, setActiveImage]   = useState(0);

  const inCart = item ? cartItems.some(ci => ci.catalogue_item_id === item.id) : false;

  // ── Reset ALL per-item state when the route param changes ─────────────────
  // ProductDetailPage is a single React component instance; React Router re-renders
  // it with new params rather than re-mounting. Without this reset, cartSuccess,
  // activeImage etc. from item A bleed into item B.
  useEffect(() => {
    setItem(null);
    setLoading(true);
    setError(null);
    setCartSuccess(false);
    setCartError(null);
    setAddingCart(false);
    setActiveImage(0);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    api.get<CatalogueItem>(`/api/v1/feed/${id}`).then(res => {
      if (res.success && res.data) {
        setItem(res.data);
      } else {
        setError('Product not found.');
      }
      setLoading(false);
    }).catch(() => {
      setError('Failed to load product details.');
      setLoading(false);
    });
  }, [id]);

  const handleAddToCart = async () => {
    if (!item || addingCart) return;
    setCartError(null);
    setAddingCart(true);
    const ok = await addItem({
      catalogue_item_id: item.id,
      vendor_id: item.vendor_id,
      vendor_name: item.vendors.company_name,
      title: item.title,
      base_price_amount: item.base_price_amount,
      base_price_currency: item.base_price_currency,
      price_unit: item.price_unit,
      service_mode: item.service_mode,
      origin_region: item.origin_region,
      destination_region: item.destination_region,
    });
    setAddingCart(false);
    if (ok) {
      setCartSuccess(true);
    } else {
      setCartError('Could not add to cart — please try again.');
    }
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ height: 20, width: 120, background: '#e2e8f0', borderRadius: 6, marginBottom: 32 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 32 }}>
          <div style={{ height: 380, background: '#e2e8f0', borderRadius: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[240, 160, 100, 80, 60].map(w => (
              <div key={w} style={{ height: 18, width: w, background: '#e2e8f0', borderRadius: 6 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !item) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <i className="ph ph-warning-circle" style={{ fontSize: 48, color: '#94a3b8', display: 'block', marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          {error ?? 'Product not found'}
        </div>
        <button
          onClick={() => navigate('/home')}
          style={{ marginTop: 16, background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}
        >
          ← Back to Feed
        </button>
      </div>
    );
  }

  const gradient  = cardGradient(item.id);
  const icon      = cardIcon(item.id);
  const modeIcon  = MODE_ICONS[item.service_mode] ?? 'ph-cube';
  const hasImages = item.media_urls && item.media_urls.length > 0;

  const priceStr = item.base_price_amount != null
    ? `${item.base_price_currency} ${item.base_price_amount.toLocaleString()} / ${item.price_unit}`
    : null;

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 24px 64px' }}>

      {/* ── Back breadcrumb ────────────────────────────────────────────── */}
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#64748b', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 24, padding: 0,
        }}
      >
        <i className="ph ph-arrow-left" style={{ fontSize: 16 }} />
        Back to Feed
      </button>

      {/* ── Two-column layout ──────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 380px',
        gap: 36,
        alignItems: 'start',
      }}>

        {/* LEFT — visuals + details */}
        <div>
          {/* Hero image / gradient */}
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            background: hasImages ? '#000' : gradient,
            height: 360,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            {hasImages ? (
              <img
                src={item.media_urls[activeImage]}
                alt={item.title}
                style={{ width: '100%', height: 360, objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <i className={`ph ${icon}`} style={{ fontSize: 96, color: 'rgba(0,0,0,0.15)' }} />
            )}
          </div>

          {/* Thumbnail strip */}
          {hasImages && item.media_urls.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {item.media_urls.map((url, i) => (
                <button
                  key={url}
                  onClick={() => setActiveImage(i)}
                  style={{
                    width: 68, height: 68, borderRadius: 10, overflow: 'hidden',
                    border: i === activeImage ? '2px solid #299E60' : '2px solid transparent',
                    padding: 0, cursor: 'pointer', background: 'none',
                  }}
                >
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Description
              </div>
              <div style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {item.description}
              </div>
            </div>
          )}

          {/* Tags */}
          {item.tags.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {item.tags.map(t => (
                  <span
                    key={t}
                    onClick={() => navigate(`/home?tag=${encodeURIComponent(t)}`)}
                    style={{
                      fontSize: 12, background: '#f1f5f9', color: '#475569',
                      borderRadius: 20, padding: '4px 12px', cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Vendor card */}
          <div style={{
            background: '#f8fafc', borderRadius: 14, padding: '18px 20px',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Vendor
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                  {item.vendors.company_name}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <i className="ph ph-map-pin" style={{ fontSize: 13 }} />
                  {item.vendors.country_of_registration}
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <i className="ph ph-tag" style={{ fontSize: 13 }} />
                  {item.vendors.business_category}
                </div>
              </div>
              <button
                onClick={() => navigate(`/vendors/${item.vendor_id}`)}
                style={{
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: '7px 16px', fontSize: 12, fontWeight: 700, color: '#374151',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <i className="ph ph-storefront" style={{ fontSize: 14 }} />
                View Profile
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — sticky summary + actions */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{
            background: '#fff', borderRadius: 18, padding: '28px 26px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}>
            {/* Service mode badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: '#f0fdf4', color: '#299E60', borderRadius: 20,
              padding: '4px 12px', fontSize: 11, fontWeight: 700, marginBottom: 14,
            }}>
              <i className={`ph ${modeIcon}`} style={{ fontSize: 13 }} />
              {item.service_mode}
            </div>

            {/* Title */}
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginBottom: 10 }}>
              {item.title}
            </div>

            {/* Vendor line */}
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ph ph-storefront" style={{ fontSize: 14, color: '#299E60' }} />
              <span style={{ fontWeight: 600, color: '#299E60' }}>{item.vendors.company_name}</span>
            </div>

            {/* Route */}
            <div style={{
              background: '#f8fafc', borderRadius: 10, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 16, fontSize: 13, color: '#374151',
            }}>
              <i className="ph ph-map-pin" style={{ fontSize: 15, color: '#64748b' }} />
              <span style={{ fontWeight: 600 }}>{item.origin_region}</span>
              <i className="ph ph-arrow-right" style={{ fontSize: 13, color: '#94a3b8' }} />
              <span style={{ fontWeight: 600 }}>{item.destination_region}</span>
            </div>

            {/* Transit time */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: '#64748b', marginBottom: 20,
            }}>
              <i className="ph ph-clock" style={{ fontSize: 15 }} />
              Transit: <strong style={{ color: '#0f172a' }}>{item.transit_days_min}–{item.transit_days_max} days</strong>
            </div>

            {/* Price */}
            <div style={{ marginBottom: 24 }}>
              {priceStr ? (
                <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>
                  {priceStr}
                </div>
              ) : (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                  padding: '10px 14px', fontSize: 13, color: '#92400e',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <i className="ph ph-chat-circle-text" style={{ fontSize: 15 }} />
                  Price on request — contact vendor for a quote
                </div>
              )}
            </div>

            {/* Saves count */}
            {item.save_count > 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ph ph-bookmark-simple" style={{ fontSize: 13 }} />
                {item.save_count} {item.save_count === 1 ? 'person has' : 'people have'} saved this
              </div>
            )}

            {/* Add to Cart CTA */}
            {item.base_price_amount != null ? (
              <button
                onClick={handleAddToCart}
                disabled={addingCart}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 10,
                  background: cartSuccess || inCart ? '#f0fdf4' : '#299E60',
                  color: cartSuccess || inCart ? '#299E60' : '#fff',
                  border: cartSuccess || inCart ? '1px solid #299E60' : '1px solid transparent',
                  fontSize: 15, fontWeight: 800, cursor: addingCart ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s', marginBottom: 10,
                } as React.CSSProperties}
              >
                <i className={`${cartSuccess || inCart ? 'ph-fill' : 'ph'} ph-shopping-cart-simple`} style={{ fontSize: 18 }} />
                {addingCart ? 'Adding…' : cartSuccess || inCart ? 'Added to Cart ✓' : 'Add to Cart'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/quotes')}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
                  background: '#299E60', color: '#fff',
                  fontSize: 15, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginBottom: 10,
                }}
              >
                <i className="ph ph-chat-circle-text" style={{ fontSize: 18 }} />
                Request a Quote
              </button>
            )}

            {/* View Cart shortcut */}
            {(cartSuccess || inCart) && (
              <button
                onClick={() => navigate('/cart')}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10,
                  background: 'none', border: '1px solid #e2e8f0', color: '#374151',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'border-color 0.15s',
                }}
              >
                <i className="ph ph-arrow-right" style={{ fontSize: 14 }} />
                Go to Cart
              </button>
            )}

            {/* Cart error */}
            {cartError && (
              <div style={{
                marginTop: 8,
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '9px 12px',
                fontSize: 12, color: '#dc2626',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <i className="ph ph-warning-circle" style={{ fontSize: 14, flexShrink: 0 }} />
                {cartError}
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: '1px solid #f1f5f9', margin: '18px 0' }} />

            {/* Item meta */}
            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>Item ID: <span style={{ fontFamily: 'monospace' }}>{item.id.slice(0, 8)}…</span></div>
              <div>Listed: {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
