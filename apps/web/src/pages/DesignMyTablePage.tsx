/**
 * DesignMyTablePage.tsx — AI-Assisted Carpentry Furniture Design Wizard
 *
 * 8-step flow:
 *  1. Choose room type         (4 cards)
 *  2. Upload room photo        (drag & drop)
 *  3. Set preferences          (table type, style, seating, material, budget)
 *  4. Generating concepts      (animated AI loading)
 *  5. View 3 design concepts   (Budget / Standard / Premium)
 *  6. Refine chosen concept    (quick-tap chips + free text)
 *  7. Confirm & convert        (delivery address, date)
 *  8. Success                  (links to order + past sessions)
 *
 * SECURITY:
 * - JWT is attached on all API calls via the project's apiClient (supabase session-aware)
 * - Photo upload uses FormData with the same auth token — multipart/form-data
 * - No direct OpenAI call — all AI via the API backend
 * - Session IDs are UUIDs; no user-controlled path traversal possible
 */

import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import type {
  DesignConcept,
  DesignSession,
  FurnitureStyle,
  MaterialPreference,
  RoomType,
  SeatingSize,
  TableType,
} from '@sbdmm/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:3001';

const BRAND = '#299E60';

const ROOM_OPTIONS: { value: RoomType; label: string; icon: string; desc: string }[] = [
  { value: 'living_room',  label: 'Living Room',   icon: 'ph ph-couch',          desc: 'Coffee or accent table' },
  { value: 'dining_room',  label: 'Dining Room',   icon: 'ph ph-fork-knife',      desc: 'Dining or banquet table' },
  { value: 'kitchen_nook', label: 'Kitchen Nook',  icon: 'ph ph-cooking-pot',     desc: 'Compact breakfast table' },
  { value: 'office_study', label: 'Office / Study',icon: 'ph ph-desktop',         desc: 'Desk or console table' },
];

const TABLE_OPTIONS: { value: TableType; label: string }[] = [
  { value: 'coffee_table',  label: 'Coffee Table' },
  { value: 'dining_table',  label: 'Dining Table' },
  { value: 'side_table',    label: 'Side Table' },
  { value: 'console_table', label: 'Console Table' },
];

const STYLE_OPTIONS: { value: FurnitureStyle; label: string; icon: string }[] = [
  { value: 'modern',     label: 'Modern',     icon: 'ph ph-squares-four' },
  { value: 'minimalist', label: 'Minimalist', icon: 'ph ph-minus-circle' },
  { value: 'rustic',     label: 'Rustic',     icon: 'ph ph-tree' },
  { value: 'classic',    label: 'Classic',    icon: 'ph ph-crown-simple' },
  { value: 'luxury',     label: 'Luxury',     icon: 'ph ph-diamond' },
];

const SEATING_OPTIONS: { value: SeatingSize; label: string }[] = [
  { value: '2_seater',       label: '2-Seater' },
  { value: '4_seater',       label: '4-Seater' },
  { value: '6_seater',       label: '6-Seater' },
  { value: '8_seater',       label: '8-Seater' },
  { value: 'not_applicable', label: 'Not Applicable' },
];

const MATERIAL_OPTIONS: { value: MaterialPreference; label: string; desc: string }[] = [
  { value: 'oak',              label: 'Oak',                desc: 'Durable, light honey grain' },
  { value: 'pine',             label: 'Pine',               desc: 'Budget-friendly, warm tone' },
  { value: 'dark_wood',        label: 'Dark Wood',          desc: 'Rich and dramatic finish' },
  { value: 'walnut',           label: 'Walnut',             desc: 'Premium, deep brown grain' },
  { value: 'mixed_wood_steel', label: 'Wood & Steel',       desc: 'Industrial-modern look' },
];

const REFINEMENT_CHIPS: string[] = [
  'Make it more compact',
  'Use lighter colours',
  'More storage underneath',
  'Add hairpin legs',
  'Make it round',
  'Use a glass top',
  'More rustic / natural finish',
  'Increase the budget',
];

const TIER_COLOURS: Record<string, { bg: string; badge: string; icon: string }> = {
  budget:   { bg: '#f0fdf4', badge: '#22c55e', icon: 'ph ph-leaf' },
  standard: { bg: '#eff6ff', badge: '#3b82f6', icon: 'ph ph-star' },
  premium:  { bg: '#fdf4ff', badge: '#a855f7', icon: 'ph ph-diamond' },
};

// ─── Step progress bar ────────────────────────────────────────────────────────

const STEP_LABELS = [
  'Room Type', 'Photo', 'Preferences', 'Generating',
  'Concepts', 'Refine', 'Confirm', 'Done',
];

function StepBar({ step }: { step: number }): React.JSX.Element {
  return (
    <div className="mb-4" style={{ overflowX: 'auto' }}>
      <div className="d-flex align-items-center gap-0" style={{ minWidth: 560 }}>
        {STEP_LABELS.map((label, i) => {
          const num    = i + 1;
          const done   = num < step;
          const active = num === step;
          const colour = done || active ? BRAND : '#cbd5e1';
          return (
            <React.Fragment key={label}>
              <div className="d-flex flex-column align-items-center" style={{ minWidth: 52 }}>
                <div
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: done ? BRAND : active ? BRAND : '#e2e8f0',
                    color: done || active ? '#fff' : '#94a3b8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13, flexShrink: 0,
                    transition: 'background 0.3s',
                  }}
                >
                  {done ? <i className="ph ph-check" style={{ fontSize: 16 }} /> : num}
                </div>
                <span style={{ fontSize: 10, color: colour, marginTop: 2, whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div style={{ flexGrow: 1, height: 2, background: done ? BRAND : '#e2e8f0', transition: 'background 0.3s', marginBottom: 14 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DesignMyTablePage(): React.JSX.Element {
  // Wizard state
  const [step,           setStep]           = useState<number>(1);
  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [roomType,       setRoomType]       = useState<RoomType | null>(null);
  const [photoFile,      setPhotoFile]      = useState<File | null>(null);
  const [photoPreview,   setPhotoPreview]   = useState<string | null>(null);
  const [photoSkipped,   setPhotoSkipped]   = useState<boolean>(false);
  const [tableType,      setTableType]      = useState<TableType>('coffee_table');
  const [style,          setStyle]          = useState<FurnitureStyle>('modern');
  const [seatingSize,    setSeatingSize]    = useState<SeatingSize>('4_seater');
  const [material,       setMaterial]       = useState<MaterialPreference>('oak');
  const [budgetMin,      setBudgetMin]      = useState<number>(500);
  const [budgetMax,      setBudgetMax]      = useState<number>(2000);
  const [session,        setSession]        = useState<DesignSession | null>(null);
  const [activeConceptIdx, setActiveConceptIdx] = useState<number>(0);
  const [refinementText, setRefinementText] = useState<string>('');
  const [deliveryAddr,   setDeliveryAddr]   = useState<string>('');
  const [requiredBy,     setRequiredBy]     = useState<string>('');
  const [convertedOrderId, setConvertedOrderId] = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [isWorking,      setIsWorking]      = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearError = () => setError(null);

  // ── STEP 1 → 2: Create session & advance ─────────────────────────────────

  const handleRoomSelect = useCallback(async (rt: RoomType) => {
    clearError();
    setIsWorking(true);
    try {
      const res = await api.post<DesignSession>('/api/v1/design/sessions', { room_type: rt });
      if (res.success && res.data) {
        setSessionId(res.data.id);
        setRoomType(rt);
        setStep(2);
      } else {
        setError(res.error?.message ?? 'Could not start your design session. Please try again.');
      }
    } catch {
      setError('Could not start your design session. Please try again.');
    } finally {
      setIsWorking(false);
    }
  }, []);

  // ── STEP 2: Photo handling ────────────────────────────────────────────────

  const handlePhotoChange = useCallback((file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handlePhotoChange(file);
  }, [handlePhotoChange]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoChange(file);
  }, [handlePhotoChange]);

  const uploadPhotoAndAdvance = useCallback(async () => {
    if (!sessionId || !photoFile) return;
    clearError();
    setIsWorking(true);
    try {
      const form = new FormData();
      form.append('photo', photoFile);
      // Get the Supabase session token for auth (same mechanism as apiClient)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_BASE_URL}/api/v1/design/sessions/${sessionId}/photo`, {
        method:  'POST',
        headers,
        body:    form,
      });
      setStep(3);
    } catch {
      setError('Photo upload failed. You can skip and continue without a photo.');
    } finally {
      setIsWorking(false);
    }
  }, [sessionId, photoFile]);

  const skipPhotoAndAdvance = useCallback(() => {
    setPhotoSkipped(true);
    setStep(3);
  }, []);

  // ── STEP 3 → 4: Generate concepts ────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!sessionId) return;
    clearError();
    setIsWorking(true);
    setStep(4); // show generating animation while waiting
    try {
      const res = await api.post<DesignSession>(`/api/v1/design/sessions/${sessionId}/generate`, {
        table_type:          tableType,
        style,
        seating_size:        seatingSize,
        material_preference: material,
        budget_min:          budgetMin,
        budget_max:          budgetMax,
        budget_currency:     'USD',
      });
      if (res.success && res.data) {
        setSession(res.data);
        setStep(5);
      } else {
        setError(res.error?.message ?? 'AI generation failed. Please try again.');
        setStep(3);
      }
    } catch {
      setError('AI generation failed. Please try again.');
      setStep(3);
    } finally {
      setIsWorking(false);
    }
  }, [sessionId, tableType, style, seatingSize, material, budgetMin, budgetMax]);

  // ── STEP 6: Refine ────────────────────────────────────────────────────────

  const handleRefine = useCallback(async (instruction: string) => {
    if (!sessionId || !instruction.trim()) return;
    clearError();
    setIsWorking(true);
    try {
      const res = await api.post<DesignSession>(`/api/v1/design/sessions/${sessionId}/refine`, {
        instruction,
        concept_index: activeConceptIdx,
      });
      if (res.success && res.data) {
        setSession(res.data);
      } else {
        setError(res.error?.message ?? 'Refinement failed. Please try again.');
      }
      setRefinementText('');
    } catch {
      setError('Refinement failed. Please try again.');
    } finally {
      setIsWorking(false);
    }
  }, [sessionId, activeConceptIdx]);

  // ── STEP 7 → 8: Convert ──────────────────────────────────────────────────

  const handleConvert = useCallback(async () => {
    if (!sessionId || !deliveryAddr.trim()) return;
    clearError();
    setIsWorking(true);
    try {
      const res = await api.post<{ order: { id: string }; session_id: string }>(`/api/v1/design/sessions/${sessionId}/convert`, {
        concept_index:    activeConceptIdx,
        delivery_address: deliveryAddr.trim(),
        required_by_date: requiredBy || undefined,
      });
      if (res.success && res.data) {
        setConvertedOrderId(res.data.order.id);
        setStep(8);
      } else {
        setError(res.error?.message ?? 'Failed to create your order. Please try again.');
      }
    } catch {
      setError('Failed to create your order. Please try again.');
    } finally {
      setIsWorking(false);
    }
  }, [sessionId, activeConceptIdx, deliveryAddr, requiredBy]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const concepts = session?.ai_concepts ?? [];
  const activeConcept: DesignConcept | undefined = concepts[activeConceptIdx];

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="container py-4" style={{ maxWidth: 760 }}>
      {/* ── Header ── */}
      <div className="mb-4">
        <h1 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.6rem', color: '#1e293b' }}>
          <i className="ph ph-magic-wand" style={{ color: BRAND, fontSize: '1.8rem' }} />
          Design My Table
        </h1>
        <p className="text-muted mb-0" style={{ fontSize: '0.93rem' }}>
          Let AI design a bespoke table for your space. Upload a room photo for best results.
        </p>
      </div>

      <StepBar step={step} />

      {/* ── Global error ── */}
      {error !== null && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3" role="alert">
          <i className="ph ph-warning-circle" />
          <span>{error}</span>
          <button className="btn-close ms-auto" onClick={clearError} aria-label="Dismiss error" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 1 — Room type */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div>
          <h2 className="h5 fw-semibold mb-3">Where will your table go?</h2>
          <div className="row g-3">
            {ROOM_OPTIONS.map((opt) => (
              <div key={opt.value} className="col-6 col-md-3">
                <button
                  className="card w-100 border-0 shadow-sm text-center py-4 px-2 h-100"
                  style={{
                    cursor: isWorking ? 'not-allowed' : 'pointer',
                    border: roomType === opt.value ? `2px solid ${BRAND}` : '2px solid transparent',
                    borderRadius: 16,
                    transition: 'all 0.2s',
                    background: '#fff',
                  }}
                  onClick={() => { if (!isWorking) void handleRoomSelect(opt.value); }}
                  disabled={isWorking}
                  aria-pressed={roomType === opt.value}
                >
                  <i className={opt.icon} style={{ fontSize: 40, color: BRAND, marginBottom: 12, display: 'block' }} />
                  <div className="fw-semibold" style={{ color: '#1e293b' }}>{opt.label}</div>
                  <div className="text-muted mt-1" style={{ fontSize: '0.78rem' }}>{opt.desc}</div>
                </button>
              </div>
            ))}
          </div>
          {isWorking && (
            <div className="text-center mt-4 text-muted">
              <div className="spinner-border spinner-border-sm me-2" role="status" />
              Starting your session…
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 2 — Photo upload */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div>
          <h2 className="h5 fw-semibold mb-1">Upload a photo of your room</h2>
          <p className="text-muted mb-3" style={{ fontSize: '0.9rem' }}>
            AI will analyse the space to design a table that fits your room's style, colour, and scale.
          </p>

          {/* Drop zone */}
          {photoPreview === null ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              aria-label="Upload room photo — click or drag and drop"
              style={{
                border: `2px dashed ${BRAND}`,
                borderRadius: 16,
                padding: '3rem 2rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#f0fdf4',
                transition: 'background 0.2s',
              }}
            >
              <i className="ph ph-image" style={{ fontSize: 48, color: BRAND, marginBottom: 12, display: 'block' }} />
              <div className="fw-semibold" style={{ color: '#1e293b' }}>Click to select or drag a photo here</div>
              <div className="text-muted mt-1" style={{ fontSize: '0.82rem' }}>JPEG, PNG, WebP or HEIC · Max 10 MB</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <div className="position-relative mb-3">
              <img
                src={photoPreview}
                alt="Room preview"
                style={{ width: '100%', borderRadius: 16, maxHeight: 320, objectFit: 'cover' }}
              />
              <button
                className="btn btn-sm btn-light position-absolute top-0 end-0 m-2"
                onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                aria-label="Remove photo"
              >
                <i className="ph ph-x" />
              </button>
            </div>
          )}

          <div className="d-flex gap-2 mt-4">
            {photoPreview !== null && (
              <button
                className="btn btn-lg fw-semibold flex-grow-1"
                style={{ background: BRAND, color: '#fff', borderRadius: 12 }}
                onClick={() => void uploadPhotoAndAdvance()}
                disabled={isWorking}
              >
                {isWorking
                  ? <><span className="spinner-border spinner-border-sm me-2" role="status" />Uploading…</>
                  : <><i className="ph ph-arrow-right me-2" />Use This Photo</>
                }
              </button>
            )}
            <button
              className="btn btn-lg btn-outline-secondary fw-semibold flex-grow-1"
              style={{ borderRadius: 12 }}
              onClick={skipPhotoAndAdvance}
              disabled={isWorking}
            >
              {photoPreview !== null ? 'Skip Photo' : <><i className="ph ph-arrow-right me-2" />Continue Without Photo</>}
            </button>
          </div>
          {photoSkipped && (
            <div className="alert alert-info mt-3 py-2" style={{ fontSize: '0.86rem' }}>
              No photo — AI will use your preferences only. Results are still excellent!
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 3 — Preferences */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div>
          <h2 className="h5 fw-semibold mb-3">Tell us your preferences</h2>

          {/* Table type */}
          <div className="mb-4">
            <label className="form-label fw-semibold">Table Type</label>
            <div className="d-flex flex-wrap gap-2">
              {TABLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className="btn btn-sm"
                  style={{
                    borderRadius: 20,
                    border: `2px solid ${tableType === opt.value ? BRAND : '#cbd5e1'}`,
                    background: tableType === opt.value ? '#f0fdf4' : '#fff',
                    color: tableType === opt.value ? BRAND : '#475569',
                    fontWeight: tableType === opt.value ? 600 : 400,
                  }}
                  onClick={() => setTableType(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div className="mb-4">
            <label className="form-label fw-semibold">Style</label>
            <div className="d-flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className="btn btn-sm"
                  style={{
                    borderRadius: 20,
                    border: `2px solid ${style === opt.value ? BRAND : '#cbd5e1'}`,
                    background: style === opt.value ? '#f0fdf4' : '#fff',
                    color: style === opt.value ? BRAND : '#475569',
                    fontWeight: style === opt.value ? 600 : 400,
                  }}
                  onClick={() => setStyle(opt.value)}
                >
                  <i className={`${opt.icon} me-1`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Seating */}
          <div className="mb-4">
            <label className="form-label fw-semibold">Seating Required</label>
            <div className="d-flex flex-wrap gap-2">
              {SEATING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className="btn btn-sm"
                  style={{
                    borderRadius: 20,
                    border: `2px solid ${seatingSize === opt.value ? BRAND : '#cbd5e1'}`,
                    background: seatingSize === opt.value ? '#f0fdf4' : '#fff',
                    color: seatingSize === opt.value ? BRAND : '#475569',
                    fontWeight: seatingSize === opt.value ? 600 : 400,
                  }}
                  onClick={() => setSeatingSize(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Material */}
          <div className="mb-4">
            <label className="form-label fw-semibold">Material Preference</label>
            <div className="row g-2">
              {MATERIAL_OPTIONS.map((opt) => (
                <div key={opt.value} className="col-6 col-md-4">
                  <button
                    className="card w-100 border-0 text-start p-3"
                    style={{
                      borderRadius: 12,
                      border: `2px solid ${material === opt.value ? BRAND : '#e2e8f0'}`,
                      background: material === opt.value ? '#f0fdf4' : '#fafafa',
                      cursor: 'pointer',
                    }}
                    onClick={() => setMaterial(opt.value)}
                    aria-pressed={material === opt.value}
                  >
                    <div className="fw-semibold" style={{ fontSize: '0.9rem', color: '#1e293b' }}>{opt.label}</div>
                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>{opt.desc}</div>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div className="mb-4">
            <label className="form-label fw-semibold">Budget Range (USD)</label>
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label text-muted small">Minimum</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={budgetMin}
                    min={0}
                    step={50}
                    onChange={(e) => setBudgetMin(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="col-6">
                <label className="form-label text-muted small">Maximum</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={budgetMax}
                    min={0}
                    step={50}
                    onChange={(e) => setBudgetMax(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            className="btn btn-lg fw-semibold w-100"
            style={{ background: BRAND, color: '#fff', borderRadius: 12 }}
            onClick={() => void handleGenerate()}
            disabled={isWorking || budgetMin >= budgetMax}
          >
            <i className="ph ph-magic-wand me-2" />
            Generate My Design Concepts
          </button>
          {budgetMin >= budgetMax && (
            <div className="text-danger mt-2 small">Minimum budget must be less than maximum.</div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 4 — AI Generating */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="text-center py-5">
          <div
            style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
              animation: 'pulse 1.8s ease-in-out infinite',
            }}
          >
            <i className="ph ph-magic-wand" style={{ fontSize: 40, color: BRAND }} />
          </div>
          <h2 className="h5 fw-bold mb-2" style={{ color: '#1e293b' }}>AI is designing your table…</h2>
          <p className="text-muted mb-4" style={{ maxWidth: 360, margin: '0 auto 1.5rem' }}>
            Our AI is analysing your room{!photoSkipped ? ' photo' : ' preferences'} and crafting three bespoke
            design concepts. This takes 10–20 seconds.
          </p>
          <div className="d-flex justify-content-center gap-3 text-muted" style={{ fontSize: '0.85rem' }}>
            {[
              { icon: 'ph ph-eye', label: 'Analysing room' },
              { icon: 'ph ph-ruler',   label: 'Sizing dimensions' },
              { icon: 'ph ph-palette', label: 'Matching styles' },
            ].map((item) => (
              <div key={item.label} className="d-flex align-items-center gap-1">
                <i className={item.icon} style={{ color: BRAND }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }`}</style>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 5 — View concepts */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 5 && concepts.length > 0 && (
        <div>
          <h2 className="h5 fw-semibold mb-1">Your 3 Design Concepts</h2>
          {session?.ai_design_rationale !== undefined && session.ai_design_rationale !== '' && (
            <p className="text-muted mb-3" style={{ fontSize: '0.9rem', background: '#f8fafc', padding: '10px 14px', borderRadius: 10, borderLeft: `3px solid ${BRAND}` }}>
              <i className="ph ph-lightbulb me-1" style={{ color: BRAND }} />
              {session.ai_design_rationale}
            </p>
          )}

          <div className="d-flex gap-2 mb-4 flex-wrap">
            {concepts.map((c, i) => {
              const colours = TIER_COLOURS[c.tier] ?? { bg: '#f8fafc', badge: '#64748b', icon: 'ph ph-star' };
              return (
                <button
                  key={c.tier}
                  className="btn flex-grow-1"
                  style={{
                    borderRadius: 20,
                    border: `2px solid ${activeConceptIdx === i ? colours.badge : '#e2e8f0'}`,
                    background: activeConceptIdx === i ? colours.bg : '#fff',
                    color: activeConceptIdx === i ? colours.badge : '#475569',
                    fontWeight: activeConceptIdx === i ? 700 : 400,
                    transition: 'all 0.2s',
                  }}
                  onClick={() => setActiveConceptIdx(i)}
                >
                  <i className={`${colours.icon} me-1`} />
                  {c.tier.charAt(0).toUpperCase() + c.tier.slice(1)}
                </button>
              );
            })}
          </div>

          {activeConcept !== undefined && (() => {
            const colours = TIER_COLOURS[activeConcept.tier] ?? { bg: '#f8fafc', badge: '#64748b', icon: 'ph ph-star' };
            return (
              <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 20, background: colours.bg, overflow: 'hidden' }}>
                <div className="card-body p-4">
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <span className="badge px-3 py-2" style={{ background: colours.badge, borderRadius: 20, fontSize: '0.8rem' }}>
                      <i className={`${colours.icon} me-1`} />
                      {activeConcept.tier.charAt(0).toUpperCase() + activeConcept.tier.slice(1)}
                    </span>
                    <h3 className="h6 fw-bold mb-0" style={{ color: '#1e293b' }}>{activeConcept.label}</h3>
                  </div>

                  <div className="row g-3 mb-3">
                    {[
                      { icon: 'ph ph-shapes',     label: 'Shape',     value: activeConcept.shape },
                      { icon: 'ph ph-ruler',       label: 'Size',      value: activeConcept.dimensions },
                      { icon: 'ph ph-paint-brush', label: 'Finish',    value: activeConcept.finish },
                      { icon: 'ph ph-columns',     label: 'Legs',      value: activeConcept.leg_style },
                      { icon: 'ph ph-palette',     label: 'Colour',    value: activeConcept.color_tone },
                      { icon: 'ph ph-clock',       label: 'Lead Time', value: `${String(activeConcept.lead_time_days)} days` },
                    ].map((item) => (
                      <div key={item.label} className="col-6 col-md-4">
                        <div className="d-flex align-items-start gap-2">
                          <i className={item.icon} style={{ color: colours.badge, fontSize: 18, marginTop: 2, flexShrink: 0 }} />
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{item.label}</div>
                            <div className="fw-semibold" style={{ fontSize: '0.88rem', color: '#1e293b' }}>{item.value}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="p-3 d-flex align-items-center justify-content-between"
                    style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colours.badge}22` }}
                  >
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.78rem' }}>Estimated Price</div>
                      <div className="fw-bold" style={{ fontSize: '1.2rem', color: colours.badge }}>
                        {activeConcept.currency} {activeConcept.price_estimate_min.toLocaleString()}
                        {' – '}
                        {activeConcept.price_estimate_max.toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm fw-semibold"
                      style={{ background: colours.badge, color: '#fff', borderRadius: 20 }}
                      onClick={() => setStep(7)}
                    >
                      Order This
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary fw-semibold flex-grow-1"
              style={{ borderRadius: 12 }}
              onClick={() => setStep(6)}
            >
              <i className="ph ph-pencil me-1" />
              Refine This Concept
            </button>
            <button
              className="btn fw-semibold flex-grow-1"
              style={{ background: BRAND, color: '#fff', borderRadius: 12 }}
              onClick={() => setStep(7)}
            >
              <i className="ph ph-check me-1" />
              Convert to Order
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 6 — Refine */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 6 && (
        <div>
          <h2 className="h5 fw-semibold mb-1">Refine Your Design</h2>
          <p className="text-muted mb-3" style={{ fontSize: '0.9rem' }}>
            Tap a suggestion or type your own instruction — the AI will update the concept instantly.
          </p>

          {/* Quick-tap chips */}
          <div className="d-flex flex-wrap gap-2 mb-4">
            {REFINEMENT_CHIPS.map((chip) => (
              <button
                key={chip}
                className="btn btn-sm"
                style={{
                  borderRadius: 20,
                  border: `1.5px solid ${BRAND}`,
                  color: BRAND,
                  background: '#f0fdf4',
                  transition: 'all 0.2s',
                }}
                onClick={() => { if (!isWorking) void handleRefine(chip); }}
                disabled={isWorking}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Free-text */}
          <div className="mb-3">
            <textarea
              className="form-control"
              rows={3}
              style={{ borderRadius: 12, resize: 'none' }}
              placeholder="Or describe your change… e.g. 'Add a drawer for storage and make the legs thicker'"
              value={refinementText}
              maxLength={500}
              onChange={(e) => setRefinementText(e.target.value)}
            />
            <div className="text-end text-muted" style={{ fontSize: '0.75rem' }}>{refinementText.length}/500</div>
          </div>

          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary fw-semibold"
              style={{ borderRadius: 12 }}
              onClick={() => setStep(5)}
              disabled={isWorking}
            >
              <i className="ph ph-arrow-left me-1" />
              Back
            </button>
            <button
              className="btn fw-semibold flex-grow-1"
              style={{ background: BRAND, color: '#fff', borderRadius: 12 }}
              onClick={() => void handleRefine(refinementText)}
              disabled={isWorking || !refinementText.trim()}
            >
              {isWorking
                ? <><span className="spinner-border spinner-border-sm me-2" role="status" />Refining…</>
                : <><i className="ph ph-magic-wand me-1" />Apply Refinement</>
              }
            </button>
          </div>

          {/* Refinement history */}
          {(session?.refinement_history ?? []).length > 0 && (
            <div className="mt-4">
              <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem', color: '#64748b' }}>Refinement History</div>
              {[...(session?.refinement_history ?? [])].reverse().map((entry, i) => (
                <div
                  key={i}
                  className="mb-2 p-3"
                  style={{ background: '#f8fafc', borderRadius: 12, fontSize: '0.84rem' }}
                >
                  <div className="fw-semibold text-muted">
                    <i className="ph ph-chat-dots me-1" />
                    {entry.instruction}
                  </div>
                  <div style={{ color: '#1e293b', marginTop: 4 }}>
                    <i className="ph ph-magic-wand me-1" style={{ color: BRAND }} />
                    {entry.response}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Back to concepts (updated) */}
          {session !== null && (
            <button
              className="btn btn-link p-0 mt-3"
              style={{ color: BRAND, fontSize: '0.88rem' }}
              onClick={() => setStep(5)}
            >
              <i className="ph ph-arrow-left me-1" />
              View updated concept
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 7 — Confirm & Convert */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 7 && activeConcept !== undefined && (
        <div>
          <h2 className="h5 fw-semibold mb-1">Confirm Your Order</h2>
          <p className="text-muted mb-4" style={{ fontSize: '0.9rem' }}>
            Review the selected design, then enter your delivery details. Our carpenters will receive
            a full AI-generated brief and begin quoting.
          </p>

          {/* Concept summary */}
          {(() => {
            const colours = TIER_COLOURS[activeConcept.tier] ?? { bg: '#f8fafc', badge: '#64748b', icon: 'ph ph-star' };
            return (
              <div
                className="p-3 mb-4 d-flex gap-3 align-items-start"
                style={{ background: colours.bg, borderRadius: 14, border: `1.5px solid ${colours.badge}33` }}
              >
                <i className={colours.icon} style={{ fontSize: 28, color: colours.badge, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div className="fw-bold" style={{ color: '#1e293b' }}>{activeConcept.label}</div>
                  <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                    {activeConcept.shape} · {activeConcept.dimensions} · {activeConcept.finish}
                  </div>
                  <div className="mt-1" style={{ color: colours.badge, fontWeight: 700 }}>
                    {activeConcept.currency} {activeConcept.price_estimate_min.toLocaleString()} – {activeConcept.price_estimate_max.toLocaleString()}
                    <span className="text-muted fw-normal ms-2" style={{ fontSize: '0.82rem' }}>
                      · {String(activeConcept.lead_time_days)}-day lead time
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-link ms-auto"
                  style={{ color: '#94a3b8', fontSize: '0.82rem', textDecoration: 'none' }}
                  onClick={() => setStep(5)}
                >
                  Change
                </button>
              </div>
            );
          })()}

          {/* Delivery details */}
          <div className="mb-3">
            <label className="form-label fw-semibold">
              Delivery Address <span className="text-danger">*</span>
            </label>
            <textarea
              className="form-control"
              rows={2}
              style={{ borderRadius: 12, resize: 'none' }}
              placeholder="Full delivery address including city and postcode"
              value={deliveryAddr}
              onChange={(e) => setDeliveryAddr(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="form-label fw-semibold">Required By Date <span className="text-muted fw-normal">(optional)</span></label>
            <input
              type="date"
              className="form-control"
              style={{ borderRadius: 12 }}
              value={requiredBy}
              onChange={(e) => setRequiredBy(e.target.value)}
              min={new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}
            />
          </div>

          <div className="alert alert-light border mb-4 py-2" style={{ fontSize: '0.85rem' }}>
            <i className="ph ph-info me-1" style={{ color: BRAND }} />
            Once submitted, verified carpenters will review the AI brief and submit competitive quotes.
            You are not committed to any purchase until you accept a quote.
          </div>

          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary fw-semibold"
              style={{ borderRadius: 12 }}
              onClick={() => setStep(5)}
              disabled={isWorking}
            >
              <i className="ph ph-arrow-left me-1" />
              Back
            </button>
            <button
              className="btn fw-semibold flex-grow-1"
              style={{ background: BRAND, color: '#fff', borderRadius: 12 }}
              onClick={() => void handleConvert()}
              disabled={isWorking || !deliveryAddr.trim()}
            >
              {isWorking
                ? <><span className="spinner-border spinner-border-sm me-2" role="status" />Creating Order…</>
                : <><i className="ph ph-paper-plane-tilt me-1" />Submit to Carpenters</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 8 — Success */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {step === 8 && (
        <div className="text-center py-5">
          <div
            style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}
          >
            <i className="ph ph-check-circle" style={{ fontSize: 48, color: BRAND }} />
          </div>
          <h2 className="h4 fw-bold mb-2" style={{ color: '#1e293b' }}>Your design order is live!</h2>
          <p className="text-muted mb-4" style={{ maxWidth: 380, margin: '0 auto 1.5rem' }}>
            Verified carpenters will review your AI brief and submit quotes. You'll be notified by
            email when quotes arrive — usually within 48 hours.
          </p>
          <div className="d-flex flex-column gap-3 align-items-center">
            {convertedOrderId !== null && (
              <Link
                to={`/orders/${convertedOrderId}`}
                className="btn btn-lg fw-semibold px-5"
                style={{ background: BRAND, color: '#fff', borderRadius: 12 }}
              >
                <i className="ph ph-eye me-2" />
                View Your Order
              </Link>
            )}
            <Link
              to="/quotes"
              className="btn btn-lg fw-semibold px-5"
              style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 12 }}
            >
              <i className="ph ph-chat-dots me-2" />
              View Incoming Quotes
            </Link>
            <button
              className="btn btn-lg btn-outline-secondary fw-semibold px-5"
              style={{ borderRadius: 12 }}
              onClick={() => {
                // Reset wizard for a new session
                setStep(1);
                setSessionId(null);
                setRoomType(null);
                setPhotoFile(null);
                setPhotoPreview(null);
                setPhotoSkipped(false);
                setSession(null);
                setActiveConceptIdx(0);
                setDeliveryAddr('');
                setRequiredBy('');
                setConvertedOrderId(null);
                clearError();
              }}
            >
              <i className="ph ph-magic-wand me-2" />
              Design Another Table
            </button>
            <Link to="/orders" className="btn btn-link" style={{ color: '#64748b', fontSize: '0.9rem' }}>
              View All Orders
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
