/**
 * MessagesPage — Business Message Composer with AI Draft Assist
 *
 * Provides a compose interface where users can describe their message
 * context and intent, and receive an AI-generated professional draft.
 * The user always edits and approves the draft before any use.
 *
 * SECURITY:
 * - All AI calls go through the secure /api/v1/ai/proxy endpoint
 * - No message content is stored server-side by this page
 * - The AI draft is advisory only — never sent automatically
 */

import React, { useState } from 'react';
import { useAiProxy } from '../hooks/useAiProxy';

const BRAND = '#299E60';

const CONTEXT_PRESETS = [
  'Requesting an update on a delayed shipment',
  'Following up on a submitted quote',
  'Reporting a damaged goods claim',
  'Requesting revised pricing or terms',
  'Confirming delivery details with a vendor',
  'Escalating a compliance concern to admin',
];

const TONE_OPTIONS = [
  { value: 'formal',       label: 'Formal',       desc: 'Legal, compliance, or escalation messages' },
  { value: 'semi-formal',  label: 'Semi-formal',  desc: 'Standard business operational messages' },
  { value: 'friendly',     label: 'Friendly',     desc: 'Established partner relationships' },
];

export default function MessagesPage(): React.JSX.Element {
  const { loading, result, error, run, reset } = useAiProxy();

  const [recipient, setRecipient]         = useState('');
  const [context, setContext]             = useState('');
  const [intent, setIntent]               = useState('');
  const [preferredTone, setPreferredTone] = useState('semi-formal');
  const [editedDraft, setEditedDraft]     = useState('');
  const [copied, setCopied]               = useState(false);

  const draft     = result?.draft as string | undefined;
  const tone      = result?.tone as string | undefined;
  const notes     = result?.notes as string | undefined;

  // Sync draft into editable field whenever AI produces a new one
  React.useEffect(() => {
    if (draft) setEditedDraft(draft);
  }, [draft]);

  const handleGenerate = async (): Promise<void> => {
    if (!context.trim() && !intent.trim()) return;
    await run('message_draft', {
      recipient: recipient.trim() || 'the recipient',
      context: context.trim(),
      intent: intent.trim(),
      preferred_tone: preferredTone,
    });
  };

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(editedDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = (): void => {
    reset();
    setEditedDraft('');
    setCopied(false);
  };

  const inputStyle: React.CSSProperties = {
    borderRadius: 8,
    fontSize: 14,
    borderColor: '#cbd5e1',
  };

  return (
    <div className="p-4" style={{ maxWidth: 900 }}>

      {/* Header */}
      <div className="mb-4">
        <h1 className="fw-bold mb-1" style={{ fontSize: 22, color: '#0f172a' }}>
          <i className="ph ph-paper-plane-tilt me-2" style={{ color: BRAND }} />
          Message Composer
        </h1>
        <p className="mb-0" style={{ fontSize: 14, color: '#64748b' }}>
          Describe your message context and let AI draft a professional reply — you review and edit before using it.
        </p>
      </div>

      <div className="row g-4">

        {/* ── Compose panel ──────────────────────────────────────────────── */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
            <div className="card-body p-4">
              <h5 className="fw-semibold mb-3" style={{ fontSize: 15, color: '#0f172a' }}>
                <i className="ph ph-pencil me-2" style={{ color: BRAND }} />
                Context
              </h5>

              {/* Recipient */}
              <div className="mb-3">
                <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                  Recipient / Company
                  <span className="fw-normal ms-1" style={{ color: '#94a3b8' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  style={inputStyle}
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="e.g. Acme Logistics, the Buyer, John"
                  maxLength={200}
                />
              </div>

              {/* Context presets */}
              <div className="mb-3">
                <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Quick Context</label>
                <div className="d-flex flex-wrap gap-6">
                  {CONTEXT_PRESETS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setContext(p)}
                      className="btn btn-sm"
                      style={{
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '3px 10px',
                        background: context === p ? BRAND : '#f1f5f9',
                        color: context === p ? '#fff' : '#475569',
                        border: `1px solid ${context === p ? BRAND : '#e2e8f0'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message context */}
              <div className="mb-3">
                <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                  Situation / Background <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  className="form-control"
                  style={{ ...inputStyle, resize: 'vertical' } as React.CSSProperties}
                  rows={3}
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="Describe the situation — e.g. 'Shipment ORD-1234 has been in customs hold for 5 days with no update from the provider.'"
                  maxLength={1000}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{context.length}/1000</div>
              </div>

              {/* Intent */}
              <div className="mb-3">
                <label className="form-label fw-semibold" style={{ fontSize: 13 }}>
                  What you want to achieve
                  <span className="fw-normal ms-1" style={{ color: '#94a3b8' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  style={inputStyle}
                  value={intent}
                  onChange={e => setIntent(e.target.value)}
                  placeholder="e.g. Request an urgent status update and estimated clearance date"
                  maxLength={300}
                />
              </div>

              {/* Tone */}
              <div className="mb-4">
                <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Tone</label>
                <div className="d-flex flex-column gap-8">
                  {TONE_OPTIONS.map(t => (
                    <label
                      key={t.value}
                      className="d-flex align-items-center gap-10"
                      style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: preferredTone === t.value ? '#f0fdf4' : '#f8fafc', border: `1px solid ${preferredTone === t.value ? '#bbf7d0' : '#e2e8f0'}`, transition: 'all 0.15s' }}
                    >
                      <input
                        type="radio"
                        name="tone"
                        value={t.value}
                        checked={preferredTone === t.value}
                        onChange={() => setPreferredTone(t.value)}
                        style={{ accentColor: BRAND }}
                      />
                      <div>
                        <div className="fw-semibold" style={{ fontSize: 13, color: '#0f172a' }}>{t.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{t.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => { void handleGenerate(); }}
                disabled={loading || (!context.trim() && !intent.trim())}
                className="btn w-100 d-flex align-items-center justify-content-center gap-8"
                style={{
                  background: loading || (!context.trim() && !intent.trim()) ? '#94a3b8' : BRAND,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 20px',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: loading || (!context.trim() && !intent.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {loading
                  ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Drafting…</>
                  : <><i className="ph ph-magic-wand" style={{ fontSize: 16 }} /> Generate Draft</>}
              </button>
            </div>
          </div>
        </div>

        {/* ── Draft panel ────────────────────────────────────────────────── */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
            <div className="card-body p-4 d-flex flex-column">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="fw-semibold mb-0" style={{ fontSize: 15, color: '#0f172a' }}>
                  <i className="ph ph-article me-2" style={{ color: BRAND }} />
                  AI Draft
                </h5>
                {result && (
                  <div className="d-flex gap-8">
                    <button
                      type="button"
                      onClick={() => { void handleCopy(); }}
                      className="btn btn-sm d-flex align-items-center gap-6"
                      style={{ background: copied ? '#f0fdf4' : '#eff6ff', color: copied ? '#15803d' : '#2563eb', border: `1px solid ${copied ? '#bbf7d0' : '#bfdbfe'}`, borderRadius: 6, fontSize: 12, fontWeight: 500 }}
                    >
                      <i className={`ph ${copied ? 'ph-check' : 'ph-copy'}`} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="btn btn-sm d-flex align-items-center gap-6"
                      style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 500 }}
                    >
                      <i className="ph ph-trash" /> Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="d-flex align-items-center gap-8 mb-3" role="alert"
                  style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                  <i className="ph ph-warning-circle" style={{ fontSize: 16 }} />
                  {error}
                </div>
              )}

              {/* Empty state */}
              {!loading && !result && !error && (
                <div className="d-flex flex-column align-items-center justify-content-center flex-grow-1 py-5 text-center">
                  <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                    style={{ width: 64, height: 64, background: '#f0fdf4' }}>
                    <i className="ph ph-magic-wand" style={{ fontSize: 28, color: BRAND }} />
                  </div>
                  <p className="fw-semibold mb-1" style={{ color: '#374151' }}>Your draft will appear here</p>
                  <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 300 }}>
                    Fill in the context on the left and click "Generate Draft" to get an AI-crafted professional message.
                  </p>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="d-flex flex-column align-items-center justify-content-center flex-grow-1 py-5">
                  <div className="spinner-border mb-3" style={{ color: BRAND }} role="status">
                    <span className="visually-hidden">Drafting…</span>
                  </div>
                  <p style={{ color: '#64748b', fontSize: 13 }}>Composing your draft…</p>
                </div>
              )}

              {/* Draft result */}
              {result && !loading && (
                <div className="d-flex flex-column gap-12 flex-grow-1">

                  {/* Tone + notes metadata */}
                  <div className="d-flex align-items-center gap-8 flex-wrap">
                    {tone && (
                      <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                        <i className="ph ph-chat-text me-1" />Tone: {tone}
                      </span>
                    )}
                    <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                      <i className="ph ph-robot me-1" />AI-generated — review before use
                    </span>
                  </div>

                  {/* Editable draft */}
                  <div>
                    <label className="form-label fw-semibold" style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Edit your draft
                    </label>
                    <textarea
                      className="form-control"
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, minHeight: 180 } as React.CSSProperties}
                      value={editedDraft}
                      onChange={e => setEditedDraft(e.target.value)}
                      rows={8}
                    />
                  </div>

                  {/* AI notes */}
                  {notes && (
                    <div className="d-flex align-items-start gap-8"
                      style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
                      <i className="ph ph-lightbulb flex-shrink-0" style={{ fontSize: 16, marginTop: 1 }} />
                      <span>{notes}</span>
                    </div>
                  )}

                  {/* Regenerate */}
                  <button
                    type="button"
                    onClick={() => { void handleGenerate(); }}
                    disabled={loading}
                    className="btn btn-sm d-flex align-items-center gap-6 align-self-start"
                    style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500 }}
                  >
                    <i className="ph ph-arrows-clockwise" /> Regenerate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Usage guidance */}
      <div className="card border-0 mt-4" style={{ borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div className="card-body py-12 px-20">
          <div className="d-flex align-items-start gap-10" style={{ fontSize: 13, color: '#64748b' }}>
            <i className="ph ph-info flex-shrink-0" style={{ fontSize: 16, color: '#2563eb', marginTop: 1 }} />
            <span>
              AI drafts are a starting point — always review, edit, and approve the content before sending.
              The AI does not have access to your live order or shipment data unless you describe it in the context field above.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
