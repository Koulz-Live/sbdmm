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

// Backend returns results per context; we fetch the tenant-wide list
interface ComplianceListItem {
  id: string;
  context_type: 'order' | 'vendor_onboarding' | 'document_upload' | 'quote';
  context_id: string;
  overall_status: string;
  blocked: boolean;
  requires_manual_review: boolean;
  evaluated_at: string;
}

export default function CompliancePage(): React.JSX.Element {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'tenant_admin' || profile?.role === 'super_admin';

  const [results, setResults] = useState<ComplianceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ComplianceResult | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Trigger evaluate form
  const [showTrigger, setShowTrigger] = useState(false);
  const [triggerOrderId, setTriggerOrderId] = useState('');
  const [isTriggeringEval, setIsTriggeringEval] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Review modal
  const [reviewTarget, setReviewTarget] = useState<{ contextId: string; checkRuleId: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const fetchResults = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    // Get all compliance results for current tenant (paginated)
    const result = await api.get<{ data: ComplianceListItem[] }>('/api/v1/compliance/results?per_page=50');
    if (result.success && result.data) {
      setResults(result.data.data ?? []);
    } else {
      setError(result.error?.message ?? 'Failed to load compliance results.');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

  const handleSelectContext = async (contextId: string): Promise<void> => {
    setIsLoadingDetail(true);
    const result = await api.get<ComplianceResult>(`/api/v1/compliance/context/${contextId}`);
    if (result.success && result.data) {
      setSelected(result.data);
    }
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
      // Refresh selected context detail
      void handleSelectContext(reviewTarget.contextId);
      void fetchResults();
    }
    setIsReviewing(false);
  };

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Compliance</h1>
        {isAdmin && (
          <CButton onClick={() => setShowTrigger((s) => !s)}>
            {showTrigger ? 'Cancel' : '▶ Trigger Evaluation'}
          </CButton>
        )}
      </div>

      {/* Trigger form */}
      {showTrigger && isAdmin && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <form onSubmit={(e) => void handleTriggerEval(e)} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 'var(--space-1)' }}>Order ID</label>
              <input
                required
                value={triggerOrderId}
                onChange={(e) => setTriggerOrderId(e.target.value)}
                placeholder="uuid of order"
                style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              />
            </div>
            <button type="submit" disabled={isTriggeringEval} style={primaryBtnStyle}>
              {isTriggeringEval ? 'Running…' : 'Run'}
            </button>
          </form>
          {triggerMsg && (
            <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: triggerMsg.type === 'success' ? '#16a34a' : 'var(--color-error)' }}>
              {triggerMsg.text}
            </div>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.5fr' : '1fr', gap: 'var(--space-6)' }}>
        {/* Results list */}
        {isLoading ? (
          <LoadingState label="Loading compliance results…" />
        ) : results.length === 0 ? (
          <EmptyState label="No compliance results yet." />
        ) : (
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <Th>Context</Th>
                  <Th>Status</Th>
                  <Th>Evaluated</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => void handleSelectContext(r.context_id)}
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: selected?.context_id === r.context_id ? 'var(--color-bg)' : 'transparent' }}
                  >
                    <Td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>{r.context_id.slice(0, 8)}…</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{r.context_type.replace(/_/g, ' ')}</div>
                    </Td>
                    <Td>
                      <ComplianceBadge status={r.overall_status} />
                      {r.blocked && <span style={{ marginLeft: 'var(--space-1)', fontSize: 'var(--text-xs)', color: '#ef4444' }}>🔒 blocked</span>}
                      {r.requires_manual_review && <span style={{ marginLeft: 'var(--space-1)', fontSize: 'var(--text-xs)', color: '#f97316' }}>👁 review</span>}
                    </Td>
                    <Td>{new Date(r.evaluated_at).toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail panel */}
        {selected && (
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Check Details</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
            </div>

            {isLoadingDetail ? (
              <LoadingState label="Loading…" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {selected.checks.map((check: ComplianceCheckDetail) => (
                  <div key={check.rule_id} style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{check.rule_name}</span>
                      <ComplianceBadge status={check.status} />
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{check.rule_type}</div>
                    {check.reason && <div style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)', color: 'var(--color-text)' }}>{check.reason}</div>}
                    {check.status === 'manual_review' && isAdmin && (
                      <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-1)' }}>
                        <button onClick={() => setReviewTarget({ contextId: selected.context_id, checkRuleId: check.rule_id })} style={{ padding: '2px var(--space-2)', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>
                          Review
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewTarget && (
        <ModalOverlay onClose={() => setReviewTarget(null)}>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Manual Review</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
            Approving will mark this check as <strong>passed</strong>. Rejecting will mark it as <strong>failed</strong> and may block the context.
          </p>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 'var(--space-1)' }}>Review Notes (optional)</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <CButton onClick={() => setReviewTarget(null)} disabled={isReviewing}>Cancel</CButton>
            <button onClick={() => void handleReview('reject')} disabled={isReviewing} style={{ ...primaryBtnStyle, background: '#ef4444' }}>Reject</button>
            <button onClick={() => void handleReview('approve')} disabled={isReviewing} style={primaryBtnStyle}>Approve</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }): React.JSX.Element {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return <div role="alert" style={{ padding: 'var(--space-4)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', marginBottom: 'var(--space-4)' }}>{message}</div>;
}

function LoadingState({ label }: { label: string }): React.JSX.Element {
  return <div aria-live="polite" aria-busy="true" style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>{label}</div>;
}

function EmptyState({ label }: { label: string }): React.JSX.Element {
  return <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>{label}</div>;
}

function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{children}</td>;
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }): React.JSX.Element {
  return (
    <div role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-xl)' }}>
        {children}
      </div>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-4)',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
};

const COMPLIANCE_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  passed: '#16a34a',
  failed: '#ef4444',
  manual_review: '#f97316',
};

function ComplianceBadge({ status }: { status: string }): React.JSX.Element {
  const color = COMPLIANCE_COLORS[status] ?? '#6b7280';
  return (
    <span style={{ display: 'inline-flex', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 500, background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
