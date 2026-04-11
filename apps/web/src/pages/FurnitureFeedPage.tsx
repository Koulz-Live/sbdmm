/**
 * FurnitureFeedPage — Pinterest-style Masonry Discovery Feed
 *
 * Displays all active catalogue items across approved vendors in the tenant.
 * Each card shows the item title, vendor, service mode, price, and a
 * deterministic gradient-based visual (no external images required).
 *
 * Features:
 * - Masonry CSS column layout (pure CSS, no JS library)
 * - Live search (debounced 350ms)
 * - Service mode filter chips
 * - Sort: Newest | Price ↑ | Price ↓
 * - Load More pagination
 * - Skeleton loading state
 * - Click card → vendor profile
 *
 * API: GET /api/v1/feed?q=&mode=&sort=&page=&per_page=
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceMode = 'FCL' | 'LCL' | 'AIR' | 'ROAD' | 'RAIL' | 'COURIER' | 'OTHER';
type SortOption  = 'newest' | 'price_asc' | 'price_desc';

interface VendorInfo {
  id: string;
  company_name: string;
  country_of_registration: string;
  business_category: string;
  website_url: string | null;
}

interface FeedItem {
  id: string;
  vendor_id: string;
  title: string;
  description: string | null;
  service_mode: ServiceMode;
  origin_region: string;
  destination_region: string;
  transit_days_min: number;
  transit_days_max: number;
  base_price_amount: number | null;
  base_price_currency: string;
  price_unit: string;
  tags: string[];
  created_at: string;
  vendors: VendorInfo;
}

interface FeedMeta {
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  filters: { q: string | null; mode: string | null; sort: SortOption };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODES: { key: ServiceMode; label: string; icon: string }[] = [
  { key: 'FCL',     label: 'FCL',     icon: 'ph-container' },
  { key: 'LCL',     label: 'LCL',     icon: 'ph-package' },
  { key: 'AIR',     label: 'Air',     icon: 'ph-airplane' },
  { key: 'ROAD',    label: 'Road',    icon: 'ph-truck' },
  { key: 'RAIL',    label: 'Rail',    icon: 'ph-train' },
  { key: 'COURIER', label: 'Courier', icon: 'ph-lightning' },
  { key: 'OTHER',   label: 'Other',   icon: 'ph-cube' },
];

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'newest',     label: 'Newest' },
  { key: 'price_asc',  label: 'Price ↑' },
  { key: 'price_desc', label: 'Price ↓' },
];

// Deterministic gradient palette based on item id hash
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
  'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
  'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)',
  'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
  'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)',
  'linear-gradient(135deg, #fbe9e7 0%, #ffccbc 100%)',
  'linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%)',
  'linear-gradient(135deg, #e0f2f1 0%, #b2dfdb 100%)',
  'linear-gradient(135deg, #f9fbe7 0%, #f0f4c3 100%)',
];

const FURNITURE_ICONS = ['ph-armchair', 'ph-couch', 'ph-bed', 'ph-table', 'ph-dresser', 'ph-door', 'ph-lamp', 'ph-bathtub'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function cardGradient(id: string): string {
  return CARD_GRADIENTS[hashStr(id) % CARD_GRADIENTS.length] ?? CARD_GRADIENTS[0]!;
}

function cardIcon(id: string): string {
  return FURNITURE_ICONS[hashStr(id) % FURNITURE_ICONS.length] ?? 'ph-armchair';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCard(): React.JSX.Element {
  const h = 140 + (Math.random() * 80 | 0);
  return (
    <div style={{
      breakInside: 'avoid',
      marginBottom: 16,
      borderRadius: 16,
      overflow: 'hidden',
      background: '#f1f5f9',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <div style={{ height: h, background: '#e2e8f0' }} />
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ height: 14, background: '#e2e8f0', borderRadius: 6, marginBottom: 8, width: '75%' }} />
        <div style={{ height: 12, background: '#e2e8f0', borderRadius: 6, width: '50%' }} />
      </div>
    </div>
  );
}

interface FeedCardProps {
  item: FeedItem;
  onClickVendor: (vendorId: string) => void;
}

function FeedCard({ item, onClickVendor }: FeedCardProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const gradient = cardGradient(item.id);
  const icon = cardIcon(item.id);

  // Vary card image height deterministically for the masonry effect
  const imgHeight = 120 + (hashStr(item.id + 'h') % 100);

  const modeInfo = MODES.find(m => m.key === item.service_mode);

  const price = item.base_price_amount != null
    ? `${item.base_price_currency} ${item.base_price_amount.toLocaleString()} ${item.price_unit}`
    : 'Quote on request';

  const transit = `${item.transit_days_min}–${item.transit_days_max} days`;

  return (
    <div
      style={{
        breakInside: 'avoid',
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: hovered
          ? '0 12px 32px rgba(0,0,0,0.14)'
          : '0 2px 8px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClickVendor(item.vendor_id)}
    >
      {/* Visual area — gradient + centred icon */}
      <div style={{
        height: imgHeight,
        background: gradient,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        <i className={`ph ${icon}`} style={{ fontSize: 48, color: 'rgba(0,0,0,0.15)' }} />

        {/* Service mode badge */}
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(4px)',
          borderRadius: 20,
          padding: '3px 10px',
          fontSize: 11,
          fontWeight: 700,
          color: '#374151',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <i className={`ph ${modeInfo?.icon ?? 'ph-cube'}`} style={{ fontSize: 13 }} />
          {item.service_mode}
        </div>

        {/* Price badge */}
        {item.base_price_amount != null && (
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: '#299E60',
            borderRadius: 20,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
          }}>
            {item.base_price_currency} {item.base_price_amount.toLocaleString()}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px 16px' }}>
        {/* Title */}
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#0f172a',
          marginBottom: 4,
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {item.title}
        </div>

        {/* Vendor name */}
        <div style={{
          fontSize: 12,
          color: '#299E60',
          fontWeight: 600,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <i className="ph ph-storefront" style={{ fontSize: 13 }} />
          {item.vendors.company_name}
        </div>

        {/* Route */}
        <div style={{
          fontSize: 12,
          color: '#64748b',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <i className="ph ph-map-pin" style={{ fontSize: 13 }} />
          {item.origin_region}
          <i className="ph ph-arrow-right" style={{ fontSize: 11, color: '#94a3b8' }} />
          {item.destination_region}
        </div>

        {/* Transit + price row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#94a3b8',
        }}>
          <span>
            <i className="ph ph-clock" style={{ fontSize: 12, marginRight: 3 }} />
            {transit}
          </span>
          <span style={{ color: item.base_price_amount != null ? '#374151' : '#94a3b8', fontWeight: item.base_price_amount != null ? 600 : 400 }}>
            {price}
          </span>
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
            {item.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{
                fontSize: 10,
                fontWeight: 500,
                background: '#f1f5f9',
                color: '#64748b',
                borderRadius: 10,
                padding: '2px 8px',
              }}>
                #{tag}
              </span>
            ))}
            {item.tags.length > 4 && (
              <span style={{ fontSize: 10, color: '#94a3b8', padding: '2px 4px' }}>
                +{item.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FurnitureFeedPage(): React.JSX.Element {
  const navigate = useNavigate();

  const [items, setItems]       = useState<FeedItem[]>([]);
  const [meta, setMeta]         = useState<FeedMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [search, setSearch]     = useState('');
  const [mode, setMode]         = useState<ServiceMode | ''>('');
  const [sort, setSort]         = useState<SortOption>('newest');
  const [page, setPage]         = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input 350ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [mode, sort]);

  const fetchFeed = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else { setLoading(true); setError(null); }

    const params = new URLSearchParams({ sort, page: String(p), per_page: '24' });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (mode) params.set('mode', mode);

    const res = await api.get<{ data: FeedItem[]; meta: FeedMeta }>(`/api/v1/feed?${params.toString()}`);

    if (!res.success || !res.data) {
      setError('Failed to load the feed. Please try again.');
    } else {
      if (append) {
        setItems(prev => [...prev, ...res.data!.data]);
      } else {
        setItems(res.data.data);
      }
      setMeta(res.data.meta);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [debouncedSearch, mode, sort]);

  // Initial load + filter changes
  useEffect(() => {
    void fetchFeed(1, false);
    setPage(1);
  }, [fetchFeed]);

  // Load more
  const handleLoadMore = (): void => {
    const next = page + 1;
    setPage(next);
    void fetchFeed(next, true);
  };

  const handleClickVendor = (vendorId: string): void => {
    navigate(`/vendors/${vendorId}`);
  };

  const hasMore = meta ? meta.pagination.has_next : false;
  const total   = meta?.pagination.total ?? 0;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 48px' }}>
      {/* ── Sticky header bar ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .feed-search-input:focus { outline: none; box-shadow: 0 0 0 3px rgba(41,158,96,0.2); }
        .feed-chip:hover { background: #299E60 !important; color: #fff !important; }
        .feed-chip-active { background: #299E60 !important; color: #fff !important; }
        .load-more-btn:hover { background: #1e7a49 !important; }
      `}</style>

      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: '#f1f5f9',
        paddingTop: 20,
        paddingBottom: 12,
        borderBottom: '1px solid #e2e8f0',
        marginBottom: 24,
      }}>
        {/* Hero headline */}
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
            <i className="ph ph-storefront me-2" style={{ color: '#299E60' }} />
            Furniture &amp; Logistics Marketplace
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Browse {total > 0 ? total.toLocaleString() : ''} active listings from approved vendors
          </p>
        </div>

        {/* Search + sort row */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {/* Search box */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
            <i className="ph ph-magnifying-glass" style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: '#94a3b8', fontSize: 16,
            }} />
            <input
              type="text"
              className="feed-search-input"
              placeholder="Search routes, vendors, services…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                border: '1.5px solid #e2e8f0',
                borderRadius: 10,
                fontSize: 14,
                background: '#fff',
                color: '#0f172a',
                transition: 'box-shadow 0.15s',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2,
                }}
              >
                <i className="ph ph-x" style={{ fontSize: 14 }} />
              </button>
            )}
          </div>

          {/* Sort select */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            style={{
              padding: '9px 12px',
              border: '1.5px solid #e2e8f0',
              borderRadius: 10,
              fontSize: 13,
              background: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Mode filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className={`feed-chip${mode === '' ? ' feed-chip-active' : ''}`}
            onClick={() => setMode('')}
            style={{
              padding: '5px 14px',
              border: '1.5px solid #e2e8f0',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: mode === '' ? '#299E60' : '#fff',
              color: mode === '' ? '#fff' : '#64748b',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            All
          </button>
          {MODES.map(m => (
            <button
              key={m.key}
              className={`feed-chip${mode === m.key ? ' feed-chip-active' : ''}`}
              onClick={() => setMode(prev => prev === m.key ? '' : m.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                border: '1.5px solid #e2e8f0',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                background: mode === m.key ? '#299E60' : '#fff',
                color: mode === m.key ? '#fff' : '#64748b',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <i className={`ph ${m.icon}`} style={{ fontSize: 13 }} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" style={{
          background: '#fef2f2', color: '#b91c1c',
          border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', marginBottom: 20, fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ph ph-warning-circle" style={{ fontSize: 18 }} />
          {error}
          <button onClick={() => { void fetchFeed(1, false); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Masonry grid ──────────────────────────────────────────────────── */}
      {loading ? (
        // Skeleton
        <div style={{
          columns: '4 240px',
          columnGap: 16,
        }}>
          {Array.from({ length: 16 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : items.length === 0 ? (
        // Empty state
        <div style={{
          textAlign: 'center',
          padding: '64px 24px',
          color: '#94a3b8',
        }}>
          <i className="ph ph-storefront" style={{ fontSize: 56, marginBottom: 16, display: 'block', color: '#cbd5e1' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
            No listings found
          </div>
          <div style={{ fontSize: 14 }}>
            {debouncedSearch || mode
              ? 'Try clearing your filters to see more results.'
              : 'No vendors have published active catalogue items yet.'}
          </div>
          {(debouncedSearch || mode) && (
            <button
              onClick={() => { setSearch(''); setMode(''); }}
              style={{
                marginTop: 16,
                padding: '8px 20px',
                background: '#299E60',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Pinterest-style CSS masonry */}
          <div style={{
            columns: '4 220px',
            columnGap: 16,
          }}>
            {items.map(item => (
              <FeedCard
                key={item.id}
                item={item}
                onClickVendor={handleClickVendor}
              />
            ))}
          </div>

          {/* Load more / end of results */}
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            {hasMore ? (
              <button
                className="load-more-btn"
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{
                  padding: '11px 36px',
                  background: '#299E60',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  opacity: loadingMore ? 0.7 : 1,
                  transition: 'background 0.15s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {loadingMore
                  ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Loading…</>
                  : <><i className="ph ph-arrow-down" />Load more</>
                }
              </button>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>
                <i className="ph ph-check-circle me-1" style={{ color: '#299E60' }} />
                {total > 0 ? `All ${total.toLocaleString()} listings shown` : ''}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
