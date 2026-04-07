/**
 * CompliancePage — Compliance results viewer and manual review console.
 *
 * Lists all compliance results for the tenant. Tenant admins can:
 *  - Trigger a manual re-evaluation for any order
 *  - Approve or reject items in `manual_review` status
 *
 * SECURITY: Only tenant_admin / super_admin can trigger evaluations or
 * perform reviews. The backend enforces this; the UI hides controls for
 * other roles as a UX convenience only.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import type { ComplianceResult, ComplianceCheckDetail } from '@sbdmm/shared';

interface ComplianceListItem {
  id: string;
  context_type: 'order' | 'vendor_onboarding' | 'document_upload' | 'quote';
  context_id: string;
  overall_status: string;
  blocked: boolean;
  requires_manual_review: boolean;
  evaluated_at: string;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

interface StatusMeta { bg: string; text: string; icon: string }
const COMPLIANCE_META: Record<string, StatusMeta> = {
  pending:       { bg: '#fffbeb', text: '#b45309', icon: 'ph-clock' },
  passed:        { bg: '#f0fdf4', text: '#15803d', icon: 'ph-check-circle' },
  failed:        { bg: '#fef2f2', text: '#b91c1c', icon: 'ph-x-circle' },
  manual_review: { bg: '#fff7ed', text: '#c2410c', icon: 'ph-eye' },
};

function ComplianceBadge({ status }: { status: string }): React.JSX.Element {
  const m = COMPLIANCE_META[status] ?? { bg: '#f8fafc', text: '#64748b', icon: 'ph-question' };
  return (
    <span className="d-inline-flex align-items-center gap-4"
      style={{ background: m.bg, color: m.text, border: `1px solid ${m.text}33`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
      <i className={`ph ${m.icon}`} style={{ fontSize: 13 }} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Context type badge ───────────────────────────────────────────────────────

const CTX_ICONS: Record<string, string> = {
  order: 'ph-package',
  vendor_onboarding: 'ph-storefront',
  document_upload: 'ph-file-text',
  quote: 'ph-chat-dots',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CompliancePage(): React.JSX.Element {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'tenant_admin' || profile?.role === 'super_admin';

  const [results, setResults] = useState<ComplianceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ComplianceResult | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [showTrigger, setShowTrigger] = useState(false);
  const [triggerOrderId, setTriggerOrderId] = useState('');
  const [isTriggeringEval, setIsTriggeringEval] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [reviewTarget, setReviewTarget] = useState<{ contextId: string; checkRuleId: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const fetchResults = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const result = await api.get<{ data: ComplianceListItem[] }>('/api/v1/compliance/results?per_page=50');
    if (result.success && result.data) setResults(result.data.data ?? []);
    else setError(result.error?.message ?? 'Failed to load compliance results.');
    setIsLoading(false);
  }, []);

  useEffect(() => { void fetchResults(); }, [fetchResults]);

  const handleSelectContext = async (contextId: string): Promise<void> => {
    setIsLoadingDetail(true);
    const result = await api.get<ComplianceResult>(`/api/v1/compliance/context/${contextId}`);
    if (result.success && result.data) setSelected(result.data);
    setIsLoadingDetail(false);
  };

  const handleTriggerEval = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!triggerOrderId.trim()) return;
    setIsTriggeringEval(true);
    setTriggerMsg(null);
    const result = await api.post('/api/v1/compliance/evaluate', {
      context_type: 'order',
      context_id: triggerOrderId.trim(),
    });
    if (result.success) {
      setTriggerMsg({ type: 'success', text: 'Evaluation triggered — results will appear shortly.' });
      setTriggerOrderId('');
      setTimeout(() => { setShowTrigger(false); setTriggerMsg(null); void fetchResults(); }, 2000);
    } else {
      setTriggerMsg({ type: 'error', text: result.error?.message ?? 'Trigger failed.' });
    }
    setIsTriggeringEval(false);
  };

  const handleReview = async (action: 'approve' | 'reject'): Promise<void> => {
    if (!reviewTarget) return;
    setIsReviewing(true);
    const result = await api.post(`/api/v1/compliance/context/${reviewTarget.contextId}/review`, {
      rule_id: reviewTarget.checkRuleId,
      action,
      notes: reviewNotes || undefined,
    });
    if (result.success) {
      setReviewTarget(null);
      setReviewNotes('');
      void handleSelectContext(reviewTarget.contextId);
      void fetchResults();
    }
    setIsReviewing(false);
  };

  return (
    <div className="p-4" style={{ maxWidth: 1200 }}>

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4">
        <div>
          <h1 className="fw-bold mb-1" style={{ fontSize: 22, color: '#0f172a' }}>Compliance</h1>
          <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
            Review trade compliance evaluations, sanctions screening, and manual review items.
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowTrigger(s => !s)}
            className="btn d-flex align-items-center gap-8"
            style={{ background: showTrigger ? '#f1f5f9' : '#299E60', color: showTrigger ? '#374151' : '#fff', border: showTrigger ? '1px solid #cbd5e1' : 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>
            <i className={`ph ${showTrigger ? 'ph-x' : 'ph-play-circle'}`} style={{ fontSize: 16 }} />
            {showTrigger ? 'Cancel' : 'Trigger Evaluation'}
          </button>
        )}
      </div>

      {/* Trigger form */}
      {showTrigger && isAdmin && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body p-4">
            <h5 className="fw-semibold mb-3" style={{ color: '#0f172a', fontSize: 16 }}>
              <i className="ph ph-play-circle me-2" style={{ color: '#299E60' }} />
              Run Compliance Evaluation
            </h5>
            <form onSubmit={(e) => void handleTriggerEval(e)}>
              <div className="d-flex gap-8 align-items-end">
                <div style={{ flex: 1 }}>
                  <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Order ID <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="text" required className="form-control"
                    value={triggerOrderId} onChange={e => setTriggerOrderId(e.target.value)}
                    placeholder="UUID of the order to evaluate"
                    style={{ borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1' }} />
                </div>
                <button type="submit" disabled={isTriggeringEval}
                  className="btn d-flex align-items-center gap-8"
                  style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>
                  {isTriggeringEval
                    ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Running…</>
                    : <><i className="ph ph-play" /> Run</>}
                </button>
              </div>
              {triggerMsg && (
                <div className="mt-2" style={{ fontSize: 13, color: triggerMsg.type === 'success' ? '#15803d' : '#b91c1c' }}>
                  <i className={`ph ${triggerMsg.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'} me-1`} />
                  {triggerMsg.text}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="d-flex align-items-center justify-content-between mb-3" role="alert"
          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
          <span><i className="ph ph-warning-circle me-2" />{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Two-column layout: list + detail */}
      <div className="row g-4">
        <div className={selected ? 'col-lg-5' : 'col-12'}>
          <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="card-body p-0">
              {isLoading ? (
                <div className="d-flex align-items-center justify-content-center p-5" style={{ color: '#64748b' }}>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" /> Loading…
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-5 px-4" style={{ color: '#94a3b8' }}>
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-20"
                    style={{ width: 72, height: 72, background: '#f0fdf4' }}
                  >
                    <i className="ph ph-shield-check" style={{ fontSize: 36, color: '#299E60' }} />
                  </div>
                  <h3 className="fw-bold mb-8" style={{ fontSize: 16, color: '#0f172a' }}>All clear — no evaluations yet</h3>
                  <p style={{ fontSize: 13, color: '#64748b', maxWidth: 400, margin: '0 auto 20px', lineHeight: 1.6 }}>
                    Compliance evaluations are automatically triggered when orders are created or documents are uploaded.
                    {isAdmin && <> You can also run a manual evaluation against any order using the button above.</>}
                  </p>
                  {isAdmin && (
                    <button
                      onClick={() => setShowTrigger(true)}
                      className="btn d-inline-flex align-items-center gap-8"
                      style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 600, fontSize: 14 }}
                    >
                      <i className="ph ph-play-circle" />
                      Run first evaluation
                    </button>
                  )}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0" style={{ fontSize: 14 }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        {['Context', 'Status', 'Evaluated'].map(h => (
                          <th key={h} className="fw-semibold border-bottom"
                            style={{ padding: '12px 16px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(r => (
                        <tr key={r.id} onClick={() => void handleSelectContext(r.context_id)}
                          style={{ cursor: 'pointer', background: selected?.context_id === r.context_id ? '#f0fdf4' : 'transparent' }}>
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            <div className="d-flex align-items-center gap-8">
                              <i className={`ph ${CTX_ICONS[r.context_type] ?? 'ph-circle'}`} style={{ fontSize: 16, color: '#299E60' }} />
                              <div>
                                <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{r.context_id.slice(0, 8)}…</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.context_type.replace(/_/g, ' ')}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            <div>
                              <ComplianceBadge status={r.overall_status} />
                              <div className="d-flex gap-4 mt-1">
                                {r.blocked && <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}><i className="ph ph-lock" /> blocked</span>}
                                {r.requires_manual_review && <span style={{ fontSize: 11, color: '#c2410c', fontWeight: 600 }}><i className="ph ph-eye" /> review needed</span>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#64748b', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {new Date(r.evaluated_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="col-lg-7">
            <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="fw-semibold mb-0" style={{ fontSize: 16, color: '#0f172a' }}>
                    <i className="ph ph-list-checks me-2" style={{ color: '#299E60' }} />
                    Check Details
                  </h5>
                  <button onClick={() => setSelected(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, lineHeight: 1 }}>×</button>
                </div>

                {isLoadingDetail ? (
                  <div className="d-flex align-items-center justify-content-center p-4" style={{ color: '#64748b' }}>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" /> Loading…
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-12">
                    {selected.checks.map((check: ComplianceCheckDetail) => (
                      <div key={check.rule_id} className="p-3" style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <span className="fw-semibold" style={{ fontSize: 14, color: '#0f172a' }}>{check.rule_name}</span>
                          <ComplianceBadge status={check.status} />
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: check.reason ? 4 : 0 }}>
                          {check.rule_type.replace(/_/g, ' ')}
                        </div>
                        {check.reason && <div style={{ fontSize: 13, color: '#475569' }}>{check.reason}</div>}
                        {check.status === 'manual_review' && isAdmin && (
                          <div className="mt-2">
                            <button
                              onClick={() => setReviewTarget({ contextId: selected.context_id, checkRuleId: check.rule_id })}
                              className="btn btn-sm d-inline-flex align-items-center gap-4"
                              style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px' }}>
                              <i className="ph ph-eye" /> Review
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewTarget && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="card border-0 shadow" style={{ borderRadius: 14, width: 480, maxWidth: '90vw' }}>
            <div className="card-body p-4">
              <div className="d-flex align-items-center gap-12 mb-3">
                <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0" style={{ width: 44, height: 44, background: '#eff6ff' }}>
                  <i className="ph ph-eye" style={{ fontSize: 20, color: '#2563eb' }} />
                </div>
                <h5 className="mb-0 fw-bold" style={{ fontSize: 17 }}>Manual Review</h5>
              </div>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                Approving will mark this check as <strong>passed</strong>. Rejecting will mark it as <strong>failed</strong> and may block the context.
              </p>
              <div className="mb-3">
                <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Review Notes <span className="fw-normal" style={{ color: '#94a3b8' }}>(optional)</span></label>
                <textarea className="form-control" rows={3} value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Add a note about your review decision…"
                  style={{ borderRadius: 8, fontSize: 14, borderColor: '#cbd5e1', resize: 'vertical' }} />
              </div>
              <div className="d-flex justify-content-end gap-8">
                <button onClick={() => setReviewTarget(null)} disabled={isReviewing}
                  className="btn" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 18px', background: '#f8fafc', color: '#374151', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={() => void handleReview('reject')} disabled={isReviewing}
                  className="btn d-flex align-items-center gap-6"
                  style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
                  {isReviewing ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> …</> : <><i className="ph ph-x" /> Reject</>}
                </button>
                <button onClick={() => void handleReview('approve')} disabled={isReviewing}
                  className="btn d-flex align-items-center gap-6"
                  style={{ background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
                  {isReviewing ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> …</> : <><i className="ph ph-check" /> Approve</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
