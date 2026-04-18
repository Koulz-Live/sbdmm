/**
 * SharedCollectionPage — public view of a shared collection.
 * Route: /shared/:shareToken (no auth required)
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/apiClient';

interface SharedItem {
  id: string;
  title: string;
  vendor_name: string;
  service_mode: string;
  origin_region: string;
  destination_region: string;
  transit_days_min: number | null;
  transit_days_max: number | null;
  base_price_amount: number | null;
  base_price_currency: string;
  tags: string[];
  note: string | null;
}

interface SharedCollection {
  id: string;
  name: string;
  description: string | null;
  items: SharedItem[];
}

const MODE_ICONS: Record<string, string> = {
  FCL: 'ph-container', LCL: 'ph-package', AIR: 'ph-airplane',
  ROAD: 'ph-truck', RAIL: 'ph-train', COURIER: 'ph-lightning', OTHER: 'ph-cube',
};

export default function SharedCollectionPage(): React.JSX.Element {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [collection, setCollection] = useState<SharedCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      const res = await api.get<SharedCollection>(`/api/v1/saves/collections/shared/${shareToken}`);
      if (cancelled) return;
      if (res.success && res.data) {
        setCollection(res.data);
      } else {
        setError(res.error?.message ?? 'Collection not found or no longer shared.');
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [shareToken]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ph ph-bookmark-simple" style={{ fontSize: 22, color: '#299E60' }} />
          <span style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
            {collection?.name ?? 'Shared Collection'}
          </span>
        </div>
        <Link to="/login" style={{ fontSize: 13, color: '#299E60', fontWeight: 600, textDecoration: 'none' }}>
          Sign in to save items →
        </Link>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px 64px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>
            <div className="spinner-border text-success" role="status" />
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 12, padding: '20px 24px', textAlign: 'center', fontSize: 15 }}>
            <i className="ph ph-warning-circle" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
            {error}
          </div>
        )}

        {collection && !loading && (
          <>
            {collection.description && (
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{collection.description}</p>
            )}
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>
              {collection.items.length} item{collection.items.length !== 1 ? 's' : ''} in this collection
            </p>

            {collection.items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 15 }}>
                This collection is empty.
              </div>
            ) : (
              <div style={{ columns: '4 220px', columnGap: 16 }}>
                {collection.items.map(item => (
                  <div key={item.id} style={{ breakInside: 'avoid', marginBottom: 16, background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    {/* Icon strip */}
                    <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`ph ${MODE_ICONS[item.service_mode] ?? 'ph-cube'}`} style={{ fontSize: 20, color: '#299E60' }} />
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.3 }}>{item.title}</span>
                    </div>

                    <div style={{ padding: '12px 16px 14px' }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                        {item.vendor_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                        <i className="ph ph-map-pin me-1" />
                        {item.origin_region} → {item.destination_region}
                      </div>
                      {item.base_price_amount != null && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#299E60', marginBottom: 6 }}>
                          {item.base_price_currency} {item.base_price_amount.toLocaleString()}
                        </div>
                      )}
                      {item.transit_days_min != null && (
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                          <i className="ph ph-clock me-1" />
                          {item.transit_days_min}–{item.transit_days_max ?? item.transit_days_min} days
                        </div>
                      )}
                      {item.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                          {item.tags.map(tag => (
                            <span key={tag} style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.note && (
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{item.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
