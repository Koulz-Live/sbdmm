/**
 * SavesPage — Personal Collection Archive
 *
 * Two views:
 *   1. Boards grid  — shows all the user's named collections as mosaic tiles
 *      (matching the Pinterest "Your saved ideas" layout in the screenshot)
 *   2. Board detail — masonry grid of items inside one collection
 *
 * State is managed entirely within this page using ?collection=<id>
 * query-param routing so the URL is shareable.
 *
 * API usage:
 *   GET  /api/v1/saves/collections              → load boards
 *   POST /api/v1/saves/collections              → create board
 *   PATCH/DELETE /api/v1/saves/collections/:id  → manage board
 *   GET  /api/v1/saves/collections/:id/items    → open board
 *   DELETE /api/v1/saves/items/:itemId          → unsave item
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedCollection {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
  cover_gradient: string | null;
  created_at: string;
  updated_at: string;
}

interface SavedItem {
  id: string;
  collection_id: string;
  catalogue_item_id: string | null;
  vendor_id: string | null;
  vendor_name: string;
  title: string;
  description: string | null;
  service_mode: string;
  origin_region: string;
  destination_region: string;
  transit_days_min: number | null;
  transit_days_max: number | null;
  base_price_amount: number | null;
  base_price_currency: string;
  price_unit: string | null;
  tags: string[];
  note: string | null;
  created_at: string;
}

// ─── Visual helpers ───────────────────────────────────────────────────────────

const GRADIENTS = [
  'linear-gradient(135deg,#e8f5e9,#c8e6c9)',
  'linear-gradient(135deg,#e3f2fd,#bbdefb)',
  'linear-gradient(135deg,#fce4ec,#f8bbd0)',
  'linear-gradient(135deg,#fff8e1,#ffecb3)',
  'linear-gradient(135deg,#f3e5f5,#e1bee7)',
  'linear-gradient(135deg,#e0f7fa,#b2ebf2)',
  'linear-gradient(135deg,#fbe9e7,#ffccbc)',
  'linear-gradient(135deg,#e8eaf6,#c5cae9)',
  'linear-gradient(135deg,#e0f2f1,#b2dfdb)',
  'linear-gradient(135deg,#f9fbe7,#f0f4c3)',
];

const ICONS = ['ph-armchair','ph-couch','ph-bed','ph-table','ph-dresser','ph-door','ph-lamp','ph-bathtub'];
const MODE_ICONS: Record<string, string> = {
  FCL:'ph-container',LCL:'ph-package',AIR:'ph-airplane',
  ROAD:'ph-truck',RAIL:'ph-train',COURIER:'ph-lightning',OTHER:'ph-cube',
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const gradient = (id: string) => GRADIENTS[hash(id) % GRADIENTS.length] ?? GRADIENTS[0]!;
const icon     = (id: string) => ICONS[hash(id) % ICONS.length] ?? 'ph-armchair';

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440 }}>
        {children}
      </div>
    </div>
  );
}

interface CreateCollectionModalProps {
  initial?: SavedCollection | undefined;
  onClose: () => void;
  onSaved: (c: SavedCollection) => void;
}

function CollectionModal({ initial, onClose, onSaved }: CreateCollectionModalProps): React.JSX.Element {
  const [name, setName]           = useState(initial?.name ?? '');
  const [description, setDesc]    = useState(initial?.description ?? '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const isEdit = !!initial;

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const body = { name: name.trim(), description: description.trim() || undefined };
    const res = isEdit
      ? await api.patch<SavedCollection>(`/api/v1/saves/collections/${initial!.id}`, body)
      : await api.post<SavedCollection>('/api/v1/saves/collections', body);
    setSaving(false);
    if (!res.success || !res.data) { setError('Failed to save. Please try again.'); return; }
    onSaved(res.data);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
          {isEdit ? 'Edit collection' : 'New collection'}
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 20, padding: 4 }}>
          <i className="ph ph-x" />
        </button>
      </div>
      <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Collection name *
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Living Room, Office Chairs…"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
              fontSize: 14, color: '#0f172a', boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Description <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="What's this collection for?"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
              fontSize: 14, color: '#0f172a', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
        </div>
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          style={{
            padding: '11px 0', background: saving ? '#94a3b8' : '#299E60', color: '#fff',
            border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer', width: '100%',
          }}
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create collection'}
        </button>
      </div>
    </div>
  );
}

// ─── Board thumbnail tile ─────────────────────────────────────────────────────

function BoardTile({
  col,
  items,
  onClick,
  onEdit,
  onDelete,
}: {
  col: SavedCollection;
  items: SavedItem[];
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Show up to 4 mini-preview tiles inside the board thumbnail
  const previews = items.slice(0, 4);
  const bg = gradient(col.id);

  return (
    <div
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
    >
      {/* Thumbnail mosaic */}
      <div
        onClick={onClick}
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          aspectRatio: '4/3',
          background: bg,
          position: 'relative',
          boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.13)' : '0 2px 8px rgba(0,0,0,0.07)',
          transform: hovered ? 'translateY(-2px)' : 'none',
          transition: 'box-shadow 0.2s, transform 0.2s',
          display: 'grid',
          gridTemplateColumns: previews.length > 1 ? '1fr 1fr' : '1fr',
          gridTemplateRows:    previews.length > 2 ? '1fr 1fr' : '1fr',
          gap: 2,
        }}
      >
        {previews.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: bg }}>
            <i className="ph ph-bookmark" style={{ fontSize: 40, color: 'rgba(0,0,0,0.15)' }} />
          </div>
        ) : (
          previews.map(item => (
            <div key={item.id} style={{
              background: gradient(item.id),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <i className={`ph ${icon(item.id)}`} style={{ fontSize: 24, color: 'rgba(0,0,0,0.18)' }} />
            </div>
          ))
        )}
        {/* Count badge */}
        {col.item_count > 0 && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(4px)',
            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, color: '#374151',
          }}>
            {col.item_count} {col.item_count === 1 ? 'item' : 'items'}
          </div>
        )}

        {/* Kebab menu button */}
        <div
          style={{ position: 'absolute', top: 8, right: 8 }}
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
        >
          <div style={{
            background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(4px)',
            borderRadius: '50%', width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
          }}>
            <i className="ph ph-dots-three" style={{ fontSize: 18, color: '#374151' }} />
          </div>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 32, right: 0, zIndex: 10,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 140, overflow: 'hidden',
            }}>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                <i className="ph ph-pencil" style={{ fontSize: 15 }} /> Rename
              </button>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444', borderTop: '1px solid #f1f5f9' }}>
                <i className="ph ph-trash" style={{ fontSize: 15 }} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title below tile */}
      <div style={{ marginTop: 8, paddingLeft: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{col.name}</div>
        {col.description && (
          <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {col.description}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Saved item card (inside a board) ────────────────────────────────────────

function SavedItemCard({
  item,
  onUnsave,
  onClickVendor,
}: {
  item: SavedItem;
  onUnsave: () => void;
  onClickVendor: () => void;
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const imgH = 110 + (hash(item.id + 'h') % 90);
  const modeIcon = MODE_ICONS[item.service_mode] ?? 'ph-cube';

  return (
    <div
      style={{
        breakInside: 'avoid', marginBottom: 14,
        borderRadius: 14, overflow: 'hidden', background: '#fff',
        boxShadow: hovered ? '0 10px 28px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirming(false); }}
    >
      {/* Visual */}
      <div style={{ height: imgH, background: gradient(item.id), position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        onClick={onClickVendor}>
        <i className={`ph ${icon(item.id)}`} style={{ fontSize: 40, color: 'rgba(0,0,0,0.15)' }} />
        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(4px)', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className={`ph ${modeIcon}`} style={{ fontSize: 12 }} />
          {item.service_mode}
        </div>
        {/* Remove button */}
        {hovered && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            {!confirming ? (
              <button onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
                style={{ background: 'rgba(255,255,255,0.88)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <i className="ph ph-bookmark-simple-slash" style={{ fontSize: 16, color: '#ef4444' }} />
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onUnsave(); }}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Remove?
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 3, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: '#299E60', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
          <i className="ph ph-storefront" style={{ fontSize: 12 }} />
          {item.vendor_name}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="ph ph-map-pin" style={{ fontSize: 12 }} />
          {item.origin_region}
          <i className="ph ph-arrow-right" style={{ fontSize: 10, color: '#94a3b8' }} />
          {item.destination_region}
        </div>
        {item.base_price_amount != null && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
            {item.base_price_currency} {item.base_price_amount.toLocaleString()} {item.price_unit ?? ''}
          </div>
        )}
        {item.note && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', fontStyle: 'italic', background: '#f8fafc', borderRadius: 6, padding: '5px 8px' }}>
            "{item.note}"
          </div>
        )}
        {item.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {item.tags.slice(0, 3).map(t => (
              <span key={t} style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', borderRadius: 10, padding: '2px 7px' }}>#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SavesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openCollectionId = searchParams.get('collection');

  const [collections, setCollections]         = useState<SavedCollection[]>([]);
  const [collectionItems, setCollectionItems] = useState<Map<string, SavedItem[]>>(new Map());
  const [loadingCols, setLoadingCols]         = useState(true);
  const [loadingItems, setLoadingItems]       = useState(false);
  const [openCollection, setOpenCollection]   = useState<SavedCollection | null>(null);
  const [openItems, setOpenItems]             = useState<SavedItem[]>([]);
  const [error, setError]                     = useState<string | null>(null);

  // Modal states
  const [showCreate, setShowCreate]   = useState(false);
  const [editTarget, setEditTarget]   = useState<SavedCollection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedCollection | null>(null);
  const [deleting, setDeleting]       = useState(false);

  // ── Load all collections ──────────────────────────────────────────────────

  const loadCollections = useCallback(async () => {
    setLoadingCols(true);
    const res = await api.get<SavedCollection[]>('/api/v1/saves/collections');
    setLoadingCols(false);
    if (!res.success || !res.data) { setError('Failed to load collections.'); return; }
    setCollections(res.data);
  }, []);

  useEffect(() => { void loadCollections(); }, [loadCollections]);

  // ── Open a collection ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!openCollectionId) { setOpenCollection(null); setOpenItems([]); return; }
    const col = collections.find(c => c.id === openCollectionId);
    if (!col) return;
    setOpenCollection(col);
    // Use cached items if already loaded
    if (collectionItems.has(openCollectionId)) {
      setOpenItems(collectionItems.get(openCollectionId) ?? []);
      return;
    }
    setLoadingItems(true);
    void api.get<{ data: SavedItem[] }>(`/api/v1/saves/collections/${openCollectionId}/items`).then(res => {
      setLoadingItems(false);
      if (!res.success || !res.data) return;
      const items = res.data.data;
      setOpenItems(items);
      setCollectionItems(prev => new Map(prev).set(openCollectionId, items));
    });
  }, [openCollectionId, collections, collectionItems]);

  // ── Collection CRUD ───────────────────────────────────────────────────────

  const handleCreated = (c: SavedCollection): void => {
    setCollections(prev => [c, ...prev]);
    setShowCreate(false);
  };

  const handleEdited = (c: SavedCollection): void => {
    setCollections(prev => prev.map(x => x.id === c.id ? c : x));
    if (openCollection?.id === c.id) setOpenCollection(c);
    setEditTarget(null);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await api.delete(`/api/v1/saves/collections/${deleteTarget.id}`);
    setDeleting(false);
    if (!res.success) { setError('Failed to delete.'); setDeleteTarget(null); return; }
    setCollections(prev => prev.filter(c => c.id !== deleteTarget.id));
    setCollectionItems(prev => { const m = new Map(prev); m.delete(deleteTarget.id); return m; });
    setDeleteTarget(null);
    if (openCollectionId === deleteTarget.id) setSearchParams({});
  };

  // ── Unsave item ───────────────────────────────────────────────────────────

  const handleUnsave = async (item: SavedItem): Promise<void> => {
    const res = await api.delete(`/api/v1/saves/items/${item.id}`);
    if (!res.success) return;
    setOpenItems(prev => prev.filter(i => i.id !== item.id));
    if (item.collection_id) {
      setCollectionItems(prev => {
        const m = new Map(prev);
        m.set(item.collection_id, (m.get(item.collection_id) ?? []).filter(i => i.id !== item.id));
        return m;
      });
      setCollections(prev => prev.map(c =>
        c.id === item.collection_id ? { ...c, item_count: Math.max(0, c.item_count - 1) } : c
      ));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 0 64px' }}>
      <style>{`
        .saves-create-btn:hover { background: #1e7a49 !important; }
        .saves-back-btn:hover { background: #f1f5f9 !important; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {openCollection && (
            <button
              className="saves-back-btn"
              onClick={() => setSearchParams({})}
              style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.15s' }}>
              <i className="ph ph-arrow-left" /> Collections
            </button>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
              <i className="ph ph-bookmark-simple me-2" style={{ color: '#299E60' }} />
              {openCollection ? openCollection.name : 'Your saved ideas'}
            </h2>
            {openCollection?.description && (
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>{openCollection.description}</p>
            )}
            {!openCollection && (
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
                {collections.length} collection{collections.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {!openCollection && (
          <button
            className="saves-create-btn"
            onClick={() => setShowCreate(true)}
            style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.15s' }}>
            <i className="ph ph-plus" /> Create
          </button>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          <i className="ph ph-warning-circle me-2" />{error}
        </div>
      )}

      {/* ── Collections grid view ─────────────────────────────────────── */}
      {!openCollection && (
        <>
          {loadingCols ? (
            <div style={{ columns: '4 180px', columnGap: 16 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ breakInside: 'avoid', marginBottom: 16, borderRadius: 16, aspectRatio: '4/3', background: '#f1f5f9', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : collections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '72px 24px', color: '#94a3b8' }}>
              <i className="ph ph-bookmark-simple" style={{ fontSize: 60, marginBottom: 16, display: 'block', color: '#cbd5e1' }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>No collections yet</div>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Save items from the Home feed to start building your collection.</div>
              <button
                onClick={() => setShowCreate(true)}
                style={{ padding: '9px 22px', background: '#299E60', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Create a collection
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 20,
            }}>
              {/* "Create" placeholder tile — mirrors Pinterest */}
              <div
                onClick={() => setShowCreate(true)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 16,
                  border: '2px dashed #e2e8f0',
                  aspectRatio: '4/3',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#94a3b8',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#299E60'; (e.currentTarget as HTMLDivElement).style.color = '#299E60'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLDivElement).style.color = '#94a3b8'; }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ph ph-plus" style={{ fontSize: 22 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Create</span>
              </div>

              {collections.map(col => (
                <BoardTile
                  key={col.id}
                  col={col}
                  items={collectionItems.get(col.id) ?? []}
                  onClick={() => setSearchParams({ collection: col.id })}
                  onEdit={() => setEditTarget(col)}
                  onDelete={() => setDeleteTarget(col)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Board detail (items masonry) ─────────────────────────────────── */}
      {openCollection && (
        <>
          {loadingItems ? (
            <div style={{ columns: '4 200px', columnGap: 14 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ breakInside: 'avoid', marginBottom: 14, borderRadius: 12, height: 160 + (i % 4) * 30, background: '#f1f5f9', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : openItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '72px 24px', color: '#94a3b8' }}>
              <i className="ph ph-bookmark-simple" style={{ fontSize: 56, marginBottom: 14, display: 'block', color: '#cbd5e1' }} />
              <div style={{ fontSize: 17, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>This collection is empty</div>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Browse the Home feed and save items here.</div>
              <button
                onClick={() => navigate('/home')}
                style={{ padding: '9px 22px', background: '#299E60', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <i className="ph ph-house-simple" /> Go to Home feed
              </button>
            </div>
          ) : (
            <div style={{ columns: '4 200px', columnGap: 14 }}>
              {openItems.map(item => (
                <SavedItemCard
                  key={item.id}
                  item={item}
                  onUnsave={() => { void handleUnsave(item); }}
                  onClickVendor={() => { if (item.vendor_id) navigate(`/vendors/${item.vendor_id}`); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {(showCreate || editTarget) && (
        <ModalOverlay onClose={() => { setShowCreate(false); setEditTarget(null); }}>
          <CollectionModal
            initial={editTarget ?? undefined}
            onClose={() => { setShowCreate(false); setEditTarget(null); }}
            onSaved={editTarget ? handleEdited : handleCreated}
          />
        </ModalOverlay>
      )}

      {deleteTarget && (
        <ModalOverlay onClose={() => setDeleteTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '24px 24px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>🗑️</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#0f172a', textAlign: 'center' }}>
                Delete "{deleteTarget.name}"?
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                This will permanently remove the collection and all {deleteTarget.item_count} saved item{deleteTarget.item_count !== 1 ? 's' : ''} inside it.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDeleteTarget(null)}
                  style={{ flex: 1, padding: '10px 0', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => { void handleDelete(); }} disabled={deleting}
                  style={{ flex: 1, padding: '10px 0', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
