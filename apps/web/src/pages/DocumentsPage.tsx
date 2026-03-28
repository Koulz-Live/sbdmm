/**
 * DocumentsPage — Trade Document Management
 *
 * SECURITY:
 * - File type allowlist enforced on both client and server
 * - File size capped at 25 MB (server enforces this too)
 * - Storage paths are NEVER exposed as public URLs — download
 *   goes through a signed-URL API endpoint
 * - Document delete requires explicit confirmation
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, apiClient } from '../lib/apiClient';
import type { TradeDocument, DocumentType, PaginationMeta } from '@sbdmm/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocumentRow extends TradeDocument {
  original_filename: string;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewed_at: string | null;
}

interface UploadForm {
  document_type: DocumentType;
  order_id: string;
  file: File | null;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
] as const;

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

const DOCUMENT_TYPES: DocumentType[] = [
  'bill_of_lading',
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
  'customs_declaration',
  'insurance_certificate',
  'dangerous_goods_declaration',
  'phytosanitary_certificate',
  'other',
];

function formatDocType(t: DocumentType): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending_review: '#d97706',
  approved:       '#16a34a',
  rejected:       '#dc2626',
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
      textTransform: 'capitalize',
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DocumentsPage(): React.JSX.Element {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UploadForm>({ document_type: 'other', order_id: '', file: null });
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocs = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DocumentRow[]>(
        `/api/v1/documents?page=${p}&per_page=20`,
      );
      if (res.success && res.data) {
        setDocs(res.data);
        if (res.meta?.pagination) setPagination(res.meta.pagination);
      }
    } catch {
      setError('Unable to load documents. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocs(page);
  }, [fetchDocs, page]);

  // ─── File validation ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setFileError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) { setForm(f => ({ ...f, file: null })); return; }

    if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
      setFileError('Only PDF, JPEG, PNG, and TIFF files are allowed.');
      if (fileRef.current) fileRef.current.value = '';
      setForm(f => ({ ...f, file: null }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`File exceeds the 25 MB limit (${formatBytes(file.size)}).`);
      if (fileRef.current) fileRef.current.value = '';
      setForm(f => ({ ...f, file: null }));
      return;
    }
    setForm(f => ({ ...f, file }));
  }

  // ─── Upload ─────────────────────────────────────────────────────────────────

  async function handleUpload(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!form.file) { setFileError('Please select a file.'); return; }

    setUploading(true);
    setError(null);
    try {
      // Multipart upload — build FormData and call the base apiClient directly
      // so we can omit the Content-Type header (browser sets multipart boundary).
      const formData = new FormData();
      formData.append('file', form.file);
      formData.append('document_type', form.document_type);
      if (form.order_id.trim()) formData.append('order_id', form.order_id.trim());

      // Use apiClient with raw fetch options via POST (body bypasses JSON stringify)
      await apiClient<unknown>('/api/v1/documents/upload', { method: 'POST', body: formData });

      setUploadSuccess(true);
      setForm({ document_type: 'other', order_id: '', file: null });
      if (fileRef.current) fileRef.current.value = '';
      setTimeout(() => {
        setUploadSuccess(false);
        setShowUpload(false);
        void fetchDocs(1);
        setPage(1);
      }, 2000);
    } catch {
      setError('Upload failed. Check the file and try again.');
    } finally {
      setUploading(false);
    }
  }

  // ─── Download (signed URL) ───────────────────────────────────────────────────

  async function handleDownload(id: string, filename: string): Promise<void> {
    try {
      const res = await api.get<{ url: string }>(`/api/v1/documents/${id}/download`);
      if (res.success && res.data?.url) {
        const a = document.createElement('a');
        a.href = res.data.url;
        a.download = filename;
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      setError('Download failed. Please try again.');
    }
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(): Promise<void> {
    if (!confirmDeleteId) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/api/v1/documents/${confirmDeleteId}`);
      setDocs(d => d.filter(x => x.id !== confirmDeleteId));
      setConfirmDeleteId(null);
    } catch {
      setError('Delete failed. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'super_admin';

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Trade Documents</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            Upload and manage Bills of Lading, invoices, customs declarations, and other trade documents.
          </p>
        </div>
        <button
          onClick={() => { setShowUpload(s => !s); setUploadSuccess(false); setFileError(null); }}
          style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          {showUpload ? '✕ Close' : '+ Upload Document'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: '1rem', fontSize: 14 }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Upload panel */}
      {showUpload && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: 16 }}>Upload Trade Document</h2>

          {uploadSuccess ? (
            <div style={{ color: '#16a34a', fontWeight: 600, padding: '10px 0' }}>
              ✓ Document uploaded successfully. Refreshing list…
            </div>
          ) : (
            <form onSubmit={(e) => { void handleUpload(e); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Document type */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Document Type <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={form.document_type}
                  onChange={e => setForm(f => ({ ...f, document_type: e.target.value as DocumentType }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14 }}
                  required
                >
                  {DOCUMENT_TYPES.map(t => (
                    <option key={t} value={t}>{formatDocType(t)}</option>
                  ))}
                </select>
              </div>

              {/* Order ID */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Order ID <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.order_id}
                  onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}
                  placeholder="UUID of the related order"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              {/* File picker */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  File <span style={{ color: '#dc2626' }}>*</span>
                  <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>PDF, JPEG, PNG, TIFF — max 25 MB</span>
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                  onChange={handleFileChange}
                  style={{ display: 'block', width: '100%', fontSize: 14 }}
                  required
                />
                {fileError && (
                  <p style={{ color: '#dc2626', fontSize: 13, margin: '4px 0 0' }}>{fileError}</p>
                )}
                {form.file && !fileError && (
                  <p style={{ color: '#16a34a', fontSize: 13, margin: '4px 0 0' }}>
                    ✓ {form.file.name} ({formatBytes(form.file.size)})
                  </p>
                )}
              </div>

              {/* Submit */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem' }}>
                <button
                  type="submit"
                  disabled={uploading || !form.file}
                  style={{ padding: '9px 20px', background: uploading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setFileError(null); }}
                  style={{ padding: '9px 20px', background: '#f1f5f9', color: '#374151', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Documents table */}
      {loading ? (
        <div aria-busy="true" style={{ color: '#6b7280', padding: '2rem', textAlign: 'center' }}>Loading documents…</div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem', border: '1px dashed #e2e8f0', borderRadius: 8 }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No documents uploaded yet.</p>
          <p style={{ fontSize: 14 }}>Click "Upload Document" to get started.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['File Name', 'Type', 'Size', 'Status', 'Uploaded', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                    {doc.original_filename}
                    {doc.order_id && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Order: {doc.order_id.slice(0, 8)}…</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#374151' }}>{formatDocType(doc.document_type)}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{formatBytes(doc.file_size_bytes)}</td>
                  <td style={{ padding: '10px 12px' }}><StatusBadge status={doc.status} /></td>
                  <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { void handleDownload(doc.id, doc.original_filename); }}
                        title="Download"
                        style={{ padding: '4px 10px', fontSize: 12, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer' }}
                      >
                        ↓ Download
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setConfirmDeleteId(doc.id)}
                          title="Delete"
                          style={{ padding: '4px 10px', fontSize: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: 13, color: '#6b7280' }}>
          <span>
            Showing {((pagination.page - 1) * pagination.per_page) + 1}–{Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page <= 1}
              style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #e2e8f0', cursor: page <= 1 ? 'not-allowed' : 'pointer', background: page <= 1 ? '#f8fafc' : '#fff', color: page <= 1 ? '#9ca3af' : '#374151' }}
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= pagination.total_pages}
              style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #e2e8f0', cursor: page >= pagination.total_pages ? 'not-allowed' : 'pointer', background: page >= pagination.total_pages ? '#f8fafc' : '#fff', color: page >= pagination.total_pages ? '#9ca3af' : '#374151' }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} role="dialog" aria-modal="true" aria-label="Confirm delete document">
          <div style={{ background: '#fff', borderRadius: 10, padding: '2rem', width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: 18 }}>Delete Document?</h3>
            <p style={{ margin: '0 0 1.25rem', color: '#374151', fontSize: 14 }}>
              This will permanently delete the document and its file from storage. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleDelete(); }}
                disabled={deleting}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
