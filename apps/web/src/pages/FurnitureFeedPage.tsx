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
 * - Furniture category filter chips (Sofas, Beds, Tables, Chairs, etc.) — filter via tag=
 * - Signal-driven trending chips: top tags + collection keywords from save activity
 *   sourced from GET /api/v1/feed/signals (tenant-wide)
 * - Sort: Newest | Popular | Price ↑ | Price ↓
 * - Load More pagination
 * - Skeleton loading state
 * - Click card → vendor profile
 *
 * API:
 *   GET /api/v1/feed/signals        — social signals for trending chips
 *   GET /api/v1/feed?q=&tag=&sort=&page=&per_page=
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';

// ─── Saved-items types (for bookmark overlay) ─────────────────────────────────

interface SavedCollection {
  id: string;
  name: string;
  item_count: number;
}

interface SaveCheckResult {
  saved: boolean;
  saves: { id: string; collection_id: string }[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption  = 'newest' | 'price_asc' | 'price_desc' | 'popular';

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
  service_mode: string;
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
  filters: { q: string | null; mode: string | null; tag: string | null; sort: SortOption };
}

// Feed signals — sourced from GET /api/v1/feed/signals
interface FeedSignals {
  top_tags:            { tag: string; count: number }[];
  top_modes:           { mode: string; count: number }[];
  top_routes:          { route: string; origin: string; destination: string; count: number }[];
  collection_keywords: { keyword: string; count: number }[];
  total_saves:         number;
  total_collections:   number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Curated furniture category chips — each maps to a tag filter on the catalogue
const FURNITURE_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'sofa',      label: 'Sofas',      icon: 'ph-armchair' },
  { key: 'bed',       label: 'Beds',       icon: 'ph-bed' },
  { key: 'table',     label: 'Tables',     icon: 'ph-table' },
  { key: 'chair',     label: 'Chairs',     icon: 'ph-office-chair' },
  { key: 'storage',   label: 'Storage',    icon: 'ph-archive-box' },
  { key: 'lighting',  label: 'Lighting',   icon: 'ph-lamp' },
  { key: 'outdoor',   label: 'Outdoor',    icon: 'ph-tree' },
  { key: 'decor',     label: 'Decor',      icon: 'ph-paint-brush' },
  { key: 'dining',    label: 'Dining',     icon: 'ph-fork-knife' },
  { key: 'office',    label: 'Office',     icon: 'ph-briefcase' },
  { key: 'kids',      label: 'Kids',       icon: 'ph-baby' },
  { key: 'bathroom',  label: 'Bathroom',   icon: 'ph-bathtub' },
];

const SORT_OPTIONS: { key: SortOption; label: string; icon: string }[] = [
  { key: 'newest',     label: 'Newest',   icon: 'ph-clock-clockwise' },
  { key: 'popular',    label: 'Popular',  icon: 'ph-fire' },
  { key: 'price_asc',  label: 'Price ↑',  icon: 'ph-sort-ascending' },
  { key: 'price_desc', label: 'Price ↓',  icon: 'ph-sort-descending' },
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

// ─── Save-to-collection modal ─────────────────────────────────────────────────

interface SaveToCollectionModalProps {
  item: FeedItem;
  onClose: () => void;
}

function SaveToCollectionModal({ item, onClose }: SaveToCollectionModalProps): React.JSX.Element {
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [savedIds, setSavedIds]       = useState<Set<string>>(new Set()); // collection ids where item is saved
  const [loading, setLoading]         = useState(true);
  const [savingId, setSavingId]       = useState<string | null>(null);

  // New collection inline creation
  const [newColName, setNewColName]     = useState('');
  const [creatingCol, setCreatingCol]   = useState(false);
  const [showNewField, setShowNewField] = useState(false);

  // Load collections + check save state
  useEffect(() => {
    void (async () => {
      const [colsRes, checkRes] = await Promise.all([
        api.get<SavedCollection[]>('/api/v1/saves/collections'),
        api.get<SaveCheckResult>(`/api/v1/saves/check/${item.id}`),
      ]);
      setLoading(false);
      if (colsRes.success && colsRes.data) setCollections(colsRes.data);
      if (checkRes.success && checkRes.data) {
        setSavedIds(new Set(checkRes.data.saves.map(s => s.collection_id)));
      }
    })();
  }, [item.id]);

  const handleSave = async (collectionId: string): Promise<void> => {
    if (savedIds.has(collectionId)) return; // already saved — no toggle-off here (use Saves page)
    setSavingId(collectionId);
    const body = {
      collection_id: collectionId,
      catalogue_item_id: item.id,
      vendor_id: item.vendor_id,
      vendor_name: item.vendors.company_name,
      title: item.title,
      description: item.description,
      service_mode: item.service_mode,
      origin_region: item.origin_region,
      destination_region: item.destination_region,
      transit_days_min: item.transit_days_min,
      transit_days_max: item.transit_days_max,
      base_price_amount: item.base_price_amount,
      base_price_currency: item.base_price_currency,
      price_unit: item.price_unit,
      tags: item.tags,
    };
    await api.post('/api/v1/saves/items', body);
    setSavedIds(prev => new Set([...prev, collectionId]));
    setCollections(prev => prev.map(c => c.id === collectionId ? { ...c, item_count: c.item_count + 1 } : c));
    setSavingId(null);
  };

  const handleCreateAndSave = async (): Promise<void> => {
    if (!newColName.trim()) return;
    setCreatingCol(true);
    const colRes = await api.post<SavedCollection>('/api/v1/saves/collections', { name: newColName.trim() });
    if (colRes.success && colRes.data) {
      const newCol = colRes.data;
      setCollections(prev => [newCol, ...prev]);
      await handleSave(newCol.id);
      setNewColName('');
      setShowNewField(false);
    }
    setCreatingCol(false);
  };

  const isSavedAnywhere = savedIds.size > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Save to collection</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, padding: 4 }}>
            <i className="ph ph-x" />
          </button>
        </div>

        {/* Body */}
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: '10px 0' }}>
          {loading ? (
            <div style={{ padding: '20px 20px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
              <i className="ph ph-circle-notch" style={{ fontSize: 24, display: 'block', marginBottom: 6, animation: 'spin 1s linear infinite' }} />
              Loading collections…
            </div>
          ) : collections.length === 0 && !showNewField ? (
            <div style={{ padding: '16px 20px', color: '#64748b', fontSize: 13, textAlign: 'center' }}>
              No collections yet.
            </div>
          ) : (
            collections.map(col => {
              const isSaved = savedIds.has(col.id);
              const isSaving = savingId === col.id;
              return (
                <div key={col.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px',
                  borderRadius: 8, cursor: isSaved ? 'default' : 'pointer',
                  background: 'transparent', transition: 'background 0.12s',
                }}
                  onMouseEnter={e => { if (!isSaved) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  onClick={() => { if (!isSaved && !isSaving) void handleSave(col.id); }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#e8f5e9,#c8e6c9)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <i className="ph ph-bookmark-simple" style={{ fontSize: 17, color: '#299E60' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{col.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{col.item_count} item{col.item_count !== 1 ? 's' : ''}</div>
                  </div>
                  {isSaving ? (
                    <i className="ph ph-circle-notch" style={{ fontSize: 18, color: '#299E60' }} />
                  ) : isSaved ? (
                    <i className="ph ph-check-circle" style={{ fontSize: 20, color: '#299E60' }} />
                  ) : (
                    <i className="ph ph-plus" style={{ fontSize: 18, color: '#94a3b8' }} />
                  )}
                </div>
              );
            })
          )}

          {/* New collection inline */}
          {showNewField && (
            <div style={{ padding: '8px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                autoFocus
                type="text"
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleCreateAndSave(); }}
                placeholder="Collection name…"
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a' }}
              />
              <button
                onClick={() => { void handleCreateAndSave(); }}
                disabled={creatingCol || !newColName.trim()}
                style={{ padding: '7px 12px', background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {creatingCol ? '…' : 'Create'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => { setShowNewField(s => !s); setNewColName(''); }}
            style={{ background: 'none', border: 'none', color: '#299E60', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <i className="ph ph-plus" /> New collection
          </button>
          {isSavedAnywhere && (
            <span style={{ fontSize: 12, color: '#299E60', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ph ph-check-circle" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface FeedCardProps {
  item: FeedItem;
  onClickVendor: (vendorId: string) => void;
  onOpenSave: (item: FeedItem) => void;
  isSaved: boolean;
}

function FeedCard({ item, onClickVendor, onOpenSave, isSaved }: FeedCardProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [bookmarkHovered, setBookmarkHovered] = useState(false);
  const gradient = cardGradient(item.id);
  const icon = cardIcon(item.id);

  // Vary card image height deterministically for the masonry effect
  const imgHeight = 120 + (hashStr(item.id + 'h') % 100);

  const modeIcon: Record<string, string> = {
    FCL: 'ph-container', LCL: 'ph-package', AIR: 'ph-airplane',
    ROAD: 'ph-truck', RAIL: 'ph-train', COURIER: 'ph-lightning', OTHER: 'ph-cube',
  };

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
          <i className={`ph ${modeIcon[item.service_mode] ?? 'ph-cube'}`} style={{ fontSize: 13 }} />
          {item.service_mode}
        </div>

        {/* Price badge — top right (when item has a price) */}
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

        {/* Bookmark button — bottom right of visual (always visible on hover) */}
        <button
          onClick={e => { e.stopPropagation(); onOpenSave(item); }}
          onMouseEnter={() => setBookmarkHovered(true)}
          onMouseLeave={() => setBookmarkHovered(false)}
          title={isSaved ? 'Saved to a collection' : 'Save to collection'}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: isSaved || bookmarkHovered ? '#299E60' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: hovered || isSaved ? 1 : 0,
            transition: 'opacity 0.2s, background 0.15s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <i
            className={isSaved || bookmarkHovered ? 'ph-fill ph-bookmark-simple' : 'ph ph-bookmark-simple'}
            style={{ fontSize: 16, color: isSaved || bookmarkHovered ? '#fff' : '#374151' }}
          />
        </button>
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
  const [activeTag, setActiveTag] = useState('');  // furniture category or trending tag filter
  const [sort, setSort]         = useState<SortOption>('newest');
  const [page, setPage]         = useState(1);

  // ── Signals (social filter data) ─────────────────────────────────────────
  const [signals, setSignals]         = useState<FeedSignals | null>(null);
  const [signalsLoaded, setSignalsLoaded] = useState(false);

  // ── Save modal ───────────────────────────────────────────────────────────
  const [saveTarget, setSaveTarget]     = useState<FeedItem | null>(null);
  const [savedItemIds, setSavedItemIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Load signals once on mount
  useEffect(() => {
    void api.get<{ data: FeedSignals }>('/api/v1/feed/signals').then(res => {
      if (res.success && res.data) setSignals(res.data.data);
      setSignalsLoaded(true);
    });
  }, []);

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
  useEffect(() => { setPage(1); }, [sort, activeTag]);

  const fetchFeed = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else { setLoading(true); setError(null); }

    const params = new URLSearchParams({ sort, page: String(p), per_page: '24' });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (activeTag) params.set('tag', activeTag);

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
  }, [debouncedSearch, activeTag, sort]);

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

  // Has any signal data with saves (used to show trending row)
  const hasSocialSignals = signals && signals.total_saves > 0;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 48px' }}>
      {/* ── Sticky header bar ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .feed-search-input:focus { outline: none; box-shadow: 0 0 0 3px rgba(41,158,96,0.2); }
        .feed-chip:hover { background: #299E60 !important; color: #fff !important; border-color: #299E60 !important; }
        .feed-chip-active { background: #299E60 !important; color: #fff !important; border-color: #299E60 !important; }
        .feed-tag-chip:hover { background: #f0fdf4 !important; border-color: #299E60 !important; color: #299E60 !important; }
        .feed-tag-chip-active { background: #f0fdf4 !important; border-color: #299E60 !important; color: #299E60 !important; }
        .feed-sort-btn:hover { background: #f8fafc !important; border-color: #94a3b8 !important; }
        .feed-sort-btn-active { background: #0f172a !important; color: #fff !important; border-color: #0f172a !important; }
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
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
            <i className="ph ph-storefront me-2" style={{ color: '#299E60' }} />
            Furniture Marketplace
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Browse {total > 0 ? total.toLocaleString() : ''} active listings from approved vendors
          </p>
        </div>

        {/* Search + sort row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
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
                boxSizing: 'border-box',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
              >
                <i className="ph ph-x" style={{ fontSize: 14 }} />
              </button>
            )}
          </div>

          {/* Sort button group */}
          <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 3, flexShrink: 0 }}>
            {SORT_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => setSort(o.key)}
                className={`feed-sort-btn${sort === o.key ? ' feed-sort-btn-active' : ''}`}
                title={o.label}
                style={{
                  padding: '5px 10px',
                  border: '1.5px solid transparent',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  background: sort === o.key ? '#0f172a' : 'transparent',
                  color: sort === o.key ? '#fff' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'background 0.12s, color 0.12s',
                }}
              >
                <i className={`ph ${o.icon}`} style={{ fontSize: 13 }} />
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Row 1: Furniture category chips ──────────────────────────────── */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
          {/* All — clears category filter */}
          <button
            className={`feed-chip${activeTag === '' ? ' feed-chip-active' : ''}`}
            onClick={() => setActiveTag('')}
            style={{ padding: '4px 13px', border: '1.5px solid #e2e8f0', borderRadius: 20, fontSize: 12, fontWeight: 600, background: activeTag === '' ? '#299E60' : '#fff', color: activeTag === '' ? '#fff' : '#64748b', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
          >
            All
          </button>
          {FURNITURE_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              className={`feed-chip${activeTag === cat.key ? ' feed-chip-active' : ''}`}
              onClick={() => setActiveTag(prev => prev === cat.key ? '' : cat.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', border: '1.5px solid #e2e8f0', borderRadius: 20, fontSize: 12, fontWeight: 600, background: activeTag === cat.key ? '#299E60' : '#fff', color: activeTag === cat.key ? '#fff' : '#64748b', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
            >
              <i className={`ph ${cat.icon}`} style={{ fontSize: 12 }} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* ── Row 2: Signal chips — trending tags + collection keywords ─────── */}
        {signalsLoaded && hasSocialSignals && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', marginRight: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ph ph-fire" style={{ fontSize: 12, color: '#f97316' }} /> Trending
            </span>

            {/* Top tags — derived from what users are saving */}
            {signals!.top_tags.slice(0, 7).map(({ tag, count }) => (
              <button
                key={`tag:${tag}`}
                className={`feed-tag-chip${activeTag === tag ? ' feed-tag-chip-active' : ''}`}
                onClick={() => setActiveTag(prev => prev === tag ? '' : tag)}
                style={{
                  padding: '4px 11px',
                  border: `1.5px solid ${activeTag === tag ? '#299E60' : '#e2e8f0'}`,
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  background: activeTag === tag ? '#f0fdf4' : '#fff',
                  color: activeTag === tag ? '#299E60' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                }}
              >
                <i className="ph ph-hash" style={{ fontSize: 11 }} />{tag}
                <span style={{ fontSize: 10, fontWeight: 700, color: activeTag === tag ? '#299E60' : '#94a3b8' }}>{count}</span>
              </button>
            ))}

            {/* Collection keywords — themes users curate boards around */}
            {signals!.collection_keywords.slice(0, 4).map(({ keyword, count }) => {
              // Only show if not already shown as a tag
              if (signals!.top_tags.some(t => t.tag === keyword)) return null;
              return (
                <button
                  key={`kw:${keyword}`}
                  className={`feed-tag-chip${activeTag === keyword ? ' feed-tag-chip-active' : ''}`}
                  onClick={() => setActiveTag(prev => prev === keyword ? '' : keyword)}
                  style={{
                    padding: '4px 11px',
                    border: `1.5px solid ${activeTag === keyword ? '#299E60' : '#e2e8f0'}`,
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    background: activeTag === keyword ? '#f0fdf4' : '#fff',
                    color: activeTag === keyword ? '#299E60' : '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                  }}
                >
                  <i className="ph ph-bookmark-simple" style={{ fontSize: 11 }} />{keyword}
                  <span style={{ fontSize: 10, color: activeTag === keyword ? '#299E60' : '#94a3b8' }}>{count}</span>
                </button>
              );
            })}

            {/* Active filter clear button */}
            {activeTag && (
              <button
                onClick={() => setActiveTag('')}
                style={{ padding: '4px 10px', border: '1.5px solid #fecaca', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className="ph ph-x" style={{ fontSize: 11 }} /> Clear
              </button>
            )}
          </div>
        )}

        {/* No signals yet — placeholder */}
        {signalsLoaded && !hasSocialSignals && (
          <div style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic' }}>
            Save items to collections to see trending picks here.
          </div>
        )}
      </div>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <div style={{ columns: '4 240px', columnGap: 16 }}>
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
            {debouncedSearch || activeTag
              ? 'Try clearing your filters to see more results.'
              : 'No vendors have published active catalogue items yet.'}
          </div>
          {(debouncedSearch || activeTag) && (
            <button
              onClick={() => { setSearch(''); setActiveTag(''); }}
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
                isSaved={savedItemIds.has(item.id)}
                onOpenSave={target => {
                  setSaveTarget(target);
                  // Mark as saved optimistically when modal is opened after save
                  setSavedItemIds(prev => {
                    if (!prev.has(target.id)) return prev; // unchanged
                    return new Set(prev);
                  });
                }}
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

      {/* ── Save-to-collection modal ─────────────────────────────────────── */}
      {saveTarget && (
        <SaveToCollectionModal
          item={saveTarget}
          onClose={() => {
            // When modal closes, mark item as saved if it was saved to any collection
            void api.get<SaveCheckResult>(`/api/v1/saves/check/${saveTarget.id}`).then(res => {
              if (res.success && res.data?.saved) {
                setSavedItemIds(prev => new Set([...prev, saveTarget.id]));
              }
            });
            setSaveTarget(null);
          }}
        />
      )}
    </div>
  );
}
