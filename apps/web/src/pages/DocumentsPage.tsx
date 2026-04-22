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
import { useAiProxy } from '../hooks/useAiProxy';
import type { TradeDocument, DocumentType, PaginationMeta } from '@sbdmm/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

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

const MAX_FILE_BYTES = 25 * 1024 * 1024;

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

// ─── Doc type icon map ────────────────────────────────────────────────────────

const DOC_TYPE_ICONS: Record<string, string> = {
  bill_of_lading: 'ph-anchor',
  commercial_invoice: 'ph-receipt',
  packing_list: 'ph-list-bullets',
  certificate_of_origin: 'ph-certificate',
  customs_declaration: 'ph-stamp',
  insurance_certificate: 'ph-shield-check',
  dangerous_goods_declaration: 'ph-warning-diamond',
  phytosanitary_certificate: 'ph-plant',
  other: 'ph-file-text',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

interface StatusMeta { bg: string; text: string; icon: string; label: string }
const STATUS_META: Record<string, StatusMeta> = {
  pending_review: { bg: '#fffbeb', text: '#b45309', icon: 'ph-clock', label: 'Pending Review' },
  approved:       { bg: '#f0fdf4', text: '#15803d', icon: 'ph-check-circle', label: 'Approved' },
  rejected:       { bg: '#fef2f2', text: '#b91c1c', icon: 'ph-x-circle', label: 'Rejected' },
};

function DocStatusBadge({ status }: { status: string }): React.JSX.Element {
  const m = STATUS_META[status] ?? { bg: '#f1f5f9', text: '#64748b', icon: 'ph-question', label: status };
  return (
    <span className="d-inline-flex align-items-center gap-4" style={{ background: m.bg, color: m.text, border: `1px solid ${m.text}44`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
      <i className={`ph ${m.icon}`} style={{ fontSize: 13 }} />
      {m.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsPage(): React.JSX.Element {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UploadForm>({ document_type: 'other', order_id: '', file: null });
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // AI Document Summary — tracks which doc is being summarised and stores results
  const { loading: aiLoading, result: aiResult, error: aiError, run: aiRun, reset: aiReset } = useAiProxy();
  const [summaryDocId, setSummaryDocId] = useState<string | null>(null);
  const [summaryResults, setSummaryResults] = useState<Record<string, Record<string, unknown>>>({});

  const handleSummarise = async (doc: DocumentRow): Promise<void> => {
    setSummaryDocId(doc.id);
    aiReset();
    await aiRun('document_summary', {
      document_type: doc.document_type,
      original_filename: doc.original_filename,
      order_id: doc.order_id ?? null,
    });
  };

  // Capture result into per-doc map whenever it arrives
  React.useEffect(() => {
    if (aiResult && summaryDocId) {
      setSummaryResults(prev => ({ ...prev, [summaryDocId]: aiResult }));
    }
  }, [aiResult, summaryDocId]);

  const fetchDocs = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DocumentRow[]>(`/api/v1/documents?page=${p}&per_page=20`);
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

  useEffect(() => { void fetchDocs(page); }, [fetchDocs, page]);

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

  async function handleUpload(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!form.file) { setFileError('Please select a file.'); return; }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', form.file);
      formData.append('document_type', form.document_type);
      if (form.order_id.trim()) formData.append('order_id', form.order_id.trim());
      await apiClient<unknown>('/api/v1/documents/upload', { method: 'POST', body: formData });
      setUploadSuccess(true);
      setForm({ document_type: 'other', order_id: '', file: null });
      if (fileRef.current) fileRef.current.value = '';
      setTimeout(() => { setUploadSuccess(false); setShowUpload(false); void fetchDocs(1); setPage(1); }, 2000);
    } catch {
      setError('Upload failed. Check the file and try again.');
    } finally {
      setUploading(false);
    }
  }

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

  return (
    <div className="p-4" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4">
        <div>
          <h1 className="fw-bold mb-1" style={{ fontSize: 22, color: '#0f172a' }}>Trade Documents</h1>
          <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
            Upload and manage Bills of Lading, invoices, customs declarations and other trade documents.
          </p>
        </div>
        <button
          className="btn d-flex align-items-center gap-8"
          onClick={() => { setShowUpload(s => !s); setUploadSuccess(false); setFileError(null); }}
          style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}
        >
          <i className={`ph ${showUpload ? 'ph-x' : 'ph-upload-simple'}`} style={{ fontSize: 16 }} />
          {showUpload ? 'Close' : 'Upload Document'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="d-flex align-items-center justify-content-between mb-3" role="alert"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
          <span><i className="ph ph-warning-circle me-2" />{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Upload panel */}
      {showUpload && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body p-4">
            <h5 className="fw-semibold mb-3" style={{ color: '#0f172a', fontSize: 16 }}>
              <i className="ph ph-file-arrow-up me-2" style={{ color: '#299E60' }} />
              Upload Trade Document
            </h5>
            <div className="d-flex align-items-center gap-8 mb-3 flex-wrap" style={{ fontSize: 12, color: '#64748b' }}>
              <span><i className="ph ph-info me-1" />Accepted:</span>
              {['PDF', 'JPEG', 'PNG', 'TIFF'].map(t => (
                <span key={t} style={{ background: '#f1f5f9', color: '#475569', borderRadius: 4, padding: '1px 7px', fontWeight: 500 }}>{t}</span>
              ))}
              <span className="ms-2">· Max 25 MB</span>
            </div>

            {uploadSuccess ? (
              <div className="d-flex align-items-center gap-8" style={{ color: '#15803d', fontWeight: 600 }}>
                <i className="ph ph-check-circle" style={{ fontSize: 20 }} />
                Document uploaded successfully. Refreshing list…
              </div>
            ) : (
              <form onSubmit={(e) => { void handleUpload(e); }}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                      Document Type <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={form.document_type}
                      onChange={e => setForm(f => ({ ...f, document_type: e.target.value as DocumentType }))}
                      required
                      style={{ borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' }}
                    >
                      {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{formatDocType(t)}</option>)}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                      Order ID <span className="fw-normal" style={{ color: '#94a3b8' }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.order_id}
                      onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}
                      placeholder="UUID of the related order"
                      style={{ borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' }}
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                      File <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div
                      onClick={() => fileRef.current?.click()}
                      style={{ border: '2px dashed #cbd5e1', borderRadius: 10, padding: '24px 16px', textAlign: 'center', background: '#f8fafc', cursor: 'pointer', position: 'relative' }}
                    >
                      <i className="ph ph-cloud-arrow-up" style={{ fontSize: 30, color: '#94a3b8', display: 'block', marginBottom: 8 }} />
                      {form.file ? (
                        <span style={{ color: '#15803d', fontWeight: 600, fontSize: 14 }}>
                          <i className="ph ph-check-circle me-1" />
                          {form.file.name} ({formatBytes(form.file.size)})
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: 14 }}>Click to choose a file or drag &amp; drop here</span>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                        onChange={handleFileChange}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                        required
                      />
                    </div>
                    {fileError && (
                      <div className="mt-1" style={{ color: '#b91c1c', fontSize: 13 }}>
                        <i className="ph ph-warning me-1" />{fileError}
                      </div>
                    )}
                  </div>

                  <div className="col-12 d-flex gap-8">
                    <button type="submit" disabled={uploading || !form.file}
                      className="btn d-flex align-items-center gap-8"
                      style={{ background: uploading ? '#86efac' : '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14 }}>
                      {uploading
                        ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Uploading…</>
                        : <><i className="ph ph-upload-simple" /> Upload</>}
                    </button>
                    <button type="button" onClick={() => { setShowUpload(false); setFileError(null); }}
                      className="btn"
                      style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 20px', fontWeight: 500, fontSize: 14 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Documents list */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div className="card-body p-0">
          {loading ? (
            <div className="d-flex align-items-center justify-content-center p-5" style={{ color: '#64748b' }}>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Loading documents…
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-5 px-4" style={{ color: '#94a3b8' }}>
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-circle mb-20"
                style={{ width: 72, height: 72, background: '#f0fdf4' }}
              >
                <i className="ph ph-files" style={{ fontSize: 36, color: '#299E60' }} />
              </div>
              <h3 className="fw-bold mb-8" style={{ fontSize: 16, color: '#0f172a' }}>No documents yet</h3>
              <p style={{ fontSize: 13, color: '#64748b', maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.6 }}>
                Upload Bills of Lading, commercial invoices, customs declarations and other trade documents to keep your shipments compliant and organised.
              </p>
              <div className="d-flex flex-wrap justify-content-center gap-8 mb-28" style={{ fontSize: 12 }}>
                {[
                  { icon: 'ph-file-pdf', label: 'Bill of Lading', color: '#0369a1' },
                  { icon: 'ph-receipt', label: 'Commercial Invoice', color: '#6d28d9' },
                  { icon: 'ph-certificate', label: 'Certificate of Origin', color: '#b45309' },
                  { icon: 'ph-stamp', label: 'Customs Declaration', color: '#0f172a' },
                ].map(({ icon, label, color }) => (
                  <span key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', color, fontWeight: 500 }}>
                    <i className={`ph ${icon} me-1`} />{label}
                  </span>
                ))}
              </div>
              <button
                onClick={() => { setShowUpload(true); setUploadSuccess(false); setFileError(null); }}
                className="btn d-inline-flex align-items-center gap-8"
                style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 600, fontSize: 14 }}
              >
                <i className="ph ph-upload-simple" />
                Upload your first document
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Document', 'Type', 'Size', 'Status', 'Uploaded', 'Actions'].map(h => (
                      <th key={h} className="fw-semibold border-bottom" style={{ padding: '12px 16px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map(doc => {
                    const summary = summaryResults[doc.id];
                    const isSummarising = aiLoading && summaryDocId === doc.id;
                    const summaryError = aiError && summaryDocId === doc.id ? aiError : null;
                    return (
                    <React.Fragment key={doc.id}>
                    <tr>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="d-flex align-items-center gap-8">
                          <div className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0" style={{ width: 32, height: 32, background: '#f1f5f9' }}>
                            <i className={`ph ${DOC_TYPE_ICONS[doc.document_type] ?? 'ph-file-text'}`} style={{ fontSize: 16, color: '#299E60' }} />
                          </div>
                          <div>
                            <div className="fw-semibold" style={{ color: '#0f172a', fontSize: 13 }}>{doc.original_filename}</div>
                            {doc.order_id && (
                              <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>Order: {doc.order_id.slice(0, 8)}…</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#475569' }}>{formatDocType(doc.document_type)}</td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#64748b', whiteSpace: 'nowrap' }}>{formatBytes(doc.file_size_bytes)}</td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}><DocStatusBadge status={doc.status} /></td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                        <div className="d-flex align-items-center gap-6">
                          <button onClick={() => { void handleDownload(doc.id, doc.original_filename); }}
                            className="btn btn-sm d-flex align-items-center gap-4"
                            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px' }}>
                            <i className="ph ph-download-simple" /> Download
                          </button>
                          <button
                            onClick={() => { if (summary) { setSummaryDocId(null); setSummaryResults(r => { const n = { ...r }; delete n[doc.id]; return n; }); } else { void handleSummarise(doc); } }}
                            disabled={isSummarising}
                            className="btn btn-sm d-flex align-items-center gap-4"
                            style={{ background: summary ? '#f0fdf4' : '#f8fafc', color: summary ? '#15803d' : '#64748b', border: `1px solid ${summary ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px' }}>
                            {isSummarising
                              ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /></>
                              : summary ? <><i className="ph ph-x" /> Hide AI Summary</> : <><i className="ph ph-sparkle" /> AI Summary</>}
                          </button>
                          {isAdmin && (
                            <button onClick={() => setConfirmDeleteId(doc.id)}
                              className="btn btn-sm d-flex align-items-center gap-4"
                              style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px' }}>
                              <i className="ph ph-trash" /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* AI Summary inline row */}
                    {(summaryError || summary) && summaryDocId === doc.id && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0 16px 12px', background: '#f8fafc' }}>
                          {summaryError ? (
                            <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                              <i className="ph ph-warning-circle me-1" />{summaryError}
                            </div>
                          ) : summary ? (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                              <div className="d-flex align-items-center gap-6 mb-10" style={{ fontSize: 12, fontWeight: 700, color: '#299E60', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <i className="ph ph-sparkle" /> AI Document Summary
                                <span style={{ background: '#eff6ff', color: '#2563eb', fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '2px 8px' }}>Beta</span>
                              </div>
                              <div className="row g-8" style={{ fontSize: 13 }}>
                                {Object.entries(summary).filter(([k]) => k !== 'confidence').map(([key, val]) => (
                                  <div key={key} className="col-md-6 col-lg-4">
                                    <span style={{ fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}: </span>
                                    <span style={{ color: '#64748b' }}>{Array.isArray(val) ? (val as string[]).join(', ') : String(val)}</span>
                                  </div>
                                ))}
                              </div>
                              {summary['confidence'] != null && (
                                <div className="mt-8" style={{ fontSize: 11, color: '#94a3b8' }}>
                                  AI confidence: {String(summary['confidence'] as string | number)} · Results are indicative only.
                                </div>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="d-flex justify-content-between align-items-center mt-3" style={{ fontSize: 13, color: '#64748b' }}>
          <span>
            Showing {((pagination.page - 1) * pagination.per_page) + 1}–{Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total}
          </span>
          <div className="d-flex gap-8">
            <button onClick={() => setPage(p => p - 1)} disabled={page <= 1}
              className="btn btn-sm"
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page <= 1 ? '#f8fafc' : '#fff', color: page <= 1 ? '#94a3b8' : '#374151' }}>
              <i className="ph ph-caret-left me-1" /> Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.total_pages}
              className="btn btn-sm"
              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', background: page >= pagination.total_pages ? '#f8fafc' : '#fff', color: page >= pagination.total_pages ? '#94a3b8' : '#374151' }}>
              Next <i className="ph ph-caret-right ms-1" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div role="dialog" aria-modal="true" aria-label="Confirm document deletion"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="card border-0 shadow" style={{ borderRadius: 14, width: 400, maxWidth: '90vw' }}>
            <div className="card-body p-4">
              <div className="d-flex align-items-center gap-12 mb-3">
                <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0" style={{ width: 44, height: 44, background: '#fef2f2' }}>
                  <i className="ph ph-trash" style={{ fontSize: 20, color: '#b91c1c' }} />
                </div>
                <h5 className="mb-0 fw-bold" style={{ fontSize: 17 }}>Delete Document?</h5>
              </div>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                This will permanently delete the document and its file from storage. <strong>This cannot be undone.</strong>
              </p>
              <div className="d-flex justify-content-end gap-8 mt-3">
                <button onClick={() => setConfirmDeleteId(null)} disabled={deleting}
                  className="btn"
                  style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 18px', background: '#f8fafc', color: '#374151', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={() => { void handleDelete(); }} disabled={deleting}
                  className="btn d-flex align-items-center gap-6"
                  style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
                  {deleting
                    ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Deleting…</>
                    : <><i className="ph ph-trash" /> Delete</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
