/**
 * MfaSetupPage — Multi-Factor Authentication setup meeting NIST SP 800-63B AAL2.
 *
 * SUPPORTED METHODS:
 *   1. TOTP Authenticator App (Google Authenticator, Microsoft Authenticator, Authy)
 *      → Highest security, offline-capable, industry standard.
 *   2. Phone / SMS OTP
 *      → Convenient AAL2-compliant second factor via Supabase + Twilio.
 *
 * AAL2 COMPLIANCE (NIST SP 800-63B §4.2):
 *   - Proof of possession of a physical authenticator (phone / hardware key).
 *   - Cryptographic challenge-response (TOTP or SMS OTP).
 *   - Enrolled factor must be 'verified' in supabase auth.factors.
 *
 * FLOW:
 *   1. GET /api/v1/auth/mfa-status → enrolled? → method selection or dashboard
 *   2a. TOTP:  enroll() → QR code display → challenge() + verify()
 *   2b. Phone: enroll({ phone }) → challenge() [SMS sent] → verify()
 *   3. On success → factor.status = 'verified' → redirect /admin
 *   4. If already enrolled → multi-factor dashboard (add / remove factors)
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type MfaMethod = 'totp' | 'phone';

type SetupStep =
  | 'loading'
  | 'checking'
  | 'aal2_challenge'  // verify existing factor before enrolling another
  | 'method_select'   // choose TOTP or Phone
  | 'totp_qr'         // scan QR code
  | 'totp_verify'     // enter 6-digit TOTP code
  | 'phone_entry'     // enter phone number (E.164)
  | 'phone_verify'    // enter SMS OTP code
  | 'already_enrolled'
  | 'success'
  | 'error';

interface MfaFactor {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
  created_at: string;
}

function toMfaFactors(
  factors: Array<{
    id: string;
    factor_type: string;
    status: string;
    friendly_name?: string;
    created_at: string;
  }>,
): MfaFactor[] {
  return factors.map(factor => ({
    id: factor.id,
    factor_type: factor.factor_type,
    status: factor.status,
    created_at: factor.created_at,
    ...(factor.friendly_name === undefined ? {} : { friendly_name: factor.friendly_name }),
  }));
}

// ─── AAL2 badge ──────────────────────────────────────────────────────────────
function Aal2Badge({ active }: { active: boolean }): React.JSX.Element {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: active ? '#f0fdf4' : '#f8fafc',
      border: `1px solid ${active ? '#bbf7d0' : '#e2e8f0'}`,
      borderRadius: 20, padding: '4px 12px',
    }}>
      <i className={`ph ${active ? 'ph-shield-check' : 'ph-shield'}`}
        style={{ fontSize: 14, color: active ? '#16a34a' : '#94a3b8' }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#15803d' : '#64748b' }}>
        {active ? 'AAL2 Protected' : 'AAL2 Required'}
      </span>
    </div>
  );
}

// ─── Helper: 6-digit OTP input ───────────────────────────────────────────────
function OtpInput({ value, onChange, disabled, idPrefix = 'otp' }: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  idPrefix?: string;
}): React.JSX.Element {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number): void => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      (document.getElementById(`${idPrefix}-${idx - 1}`) as HTMLInputElement | null)?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number): void => {
    const raw = e.target.value.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[idx] = raw.slice(-1);
    onChange(newDigits.join(''));
    if (raw && idx < 5) {
      (document.getElementById(`${idPrefix}-${idx + 1}`) as HTMLInputElement | null)?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent): void => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) { onChange(pasted); e.preventDefault(); }
  };

  return (
    <div className="d-flex gap-10 justify-content-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          id={`${idPrefix}-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(e, i)}
          onKeyDown={e => handleKeyDown(e, i)}
          style={{
            width: 52, height: 60, textAlign: 'center', fontSize: 26, fontWeight: 700,
            border: d ? '2px solid #299E60' : '2px solid #e2e8f0',
            borderRadius: 10, outline: 'none', background: disabled ? '#f8fafc' : '#fff',
            color: '#0f172a', transition: 'border-color 0.15s',
          }}
        />
      ))}
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ steps, current }: { steps: string[]; current: number }): React.JSX.Element {
  return (
    <div className="d-flex align-items-center gap-0 mb-28">
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          <div className="d-flex align-items-center gap-6">
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: i < current ? '#299E60' : i === current ? '#299E60' : '#e2e8f0',
              color: i <= current ? '#fff' : '#94a3b8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
            }}>
              {i < current ? <i className="ph ph-check" style={{ fontSize: 13 }} /> : i + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: i === current ? 700 : 400, color: i === current ? '#0f172a' : '#94a3b8' }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: i < current ? '#299E60' : '#e2e8f0', margin: '0 8px' }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MfaSetupPage(): React.JSX.Element {
  const { profile, refreshProfile, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]               = useState<SetupStep>('loading');
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [selectedMethod, setMethod]   = useState<MfaMethod>('totp');

  // TOTP enroll state
  const [factorId, setFactorId]       = useState<string>('');
  const [qrUri, setQrUri]             = useState<string>('');
  const [secret, setSecret]           = useState<string>('');
  const [showSecret, setShowSecret]   = useState(false);

  // Phone enroll state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError]   = useState('');
  const [phoneEnrolling, setPhoneEnrolling] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Verify state (shared TOTP + phone)
  const [otp, setOtp]                 = useState('');
  const [verifying, setVerifying]     = useState(false);

  // Already enrolled state
  const [factors, setFactors]         = useState<MfaFactor[]>([]);
  const [removingId, setRemovingId]   = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // AAL2 challenge state (verify existing factor before adding a new one)
  const [aal2FactorId, setAal2FactorId]       = useState('');
  const [aal2Otp, setAal2Otp]                 = useState('');
  const [aal2Verifying, setAal2Verifying]     = useState(false);
  const [aal2ErrorMsg, setAal2ErrorMsg]       = useState<string | null>(null);
  const [pendingEnrollMethod, setPendingEnrollMethod] = useState<MfaMethod | null>(null);

  // ─── Resend countdown ───────────────────────────────────────────────────
  const startResendCooldown = (): void => {
    setResendCooldown(60);
    resendTimer.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(resendTimer.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // Clean up timer on unmount
  useEffect(() => () => { if (resendTimer.current) clearInterval(resendTimer.current); }, []);

  // ─── Helpers to detect error type ──────────────────────────────────────
  const isAal2RequiredError = (msg: string): boolean =>
    msg.toLowerCase().includes('aal2') ||
    msg.toLowerCase().includes('assurance level') ||
    msg.toLowerCase().includes('mfa challenge required');

  const friendlyEnrollError = (msg: string, status?: number): string => {
    const lower = msg.toLowerCase();
    if (lower.includes('origin not allowed') || lower.includes('origin') || status === 422) {
      return 'This domain is not authorised in Supabase Auth settings. ' +
        'Add https://sbdmm.vercel.app to Supabase → Authentication → URL Configuration, ' +
        'then enable MFA under Authentication → Sign In Methods.';
    }
    if (lower.includes('phone') || lower.includes('twilio') || lower.includes('sms')) {
      return 'SMS/Phone MFA requires Twilio to be configured in your Supabase project. ' +
        'Please use the Authenticator App method instead, or contact your system administrator.';
    }
    if (lower.includes('already') || lower.includes('exists')) {
      return 'A factor of this type is already enrolled. Please remove it first from the dashboard.';
    }
    return msg;
  };

  // ─── Initiate AAL2 challenge against an existing verified factor ─────────
  // Called when Supabase rejects enrollment because the session is only AAL1.
  const initiateAal2Challenge = async (fs: MfaFactor[], pending?: MfaMethod): Promise<void> => {
    const verifiedFactor = fs.find(f => f.status === 'verified');
    if (!verifiedFactor) {
      // No verified factor to challenge — let them enroll fresh
      if (pending) setMethod(pending);
      setStep('method_select');
      return;
    }
    const { data: cd, error: ce } = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id });
    if (ce || !cd) {
      // If challenge creation fails, fall back to the dashboard
      setStep('already_enrolled');
      return;
    }
    setAal2FactorId(verifiedFactor.id);
    setAal2Otp('');
    setAal2ErrorMsg(null);
    if (pending !== undefined) setPendingEnrollMethod(pending);
    setStep('aal2_challenge');
  };

  // ─── Verify AAL2 challenge → elevate session → retry pending action ──────
  const handleAal2Verify = async (): Promise<void> => {
    if (aal2Otp.length !== 6) return;
    setAal2Verifying(true); setAal2ErrorMsg(null);

    // Create a FRESH challenge immediately before verifying.
    // The challenge stored in state from initiateAal2Challenge may be stale
    // (TOTP challenges are single-use and expire quickly). This mirrors the
    // approach used in handleVerify for regular TOTP verification.
    const { data: freshChallenge, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId: aal2FactorId,
    });
    if (challengeErr || !freshChallenge) {
      setAal2ErrorMsg(challengeErr?.message ?? 'Failed to create MFA challenge. Please try again.');
      setAal2Verifying(false);
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: aal2FactorId,
      challengeId: freshChallenge.id,
      code: aal2Otp,
    });
    if (error) {
      setAal2ErrorMsg(
        error.message?.toLowerCase().includes('invalid')
          ? 'Invalid code — make sure you are entering the current 6-digit code from your authenticator app (codes rotate every 30 s).'
          : (error.message ?? 'Verification failed. Please try again.'),
      );
      setAal2Otp('');
      setAal2Verifying(false);
      setTimeout(() => (document.getElementById('aal2-0') as HTMLInputElement | null)?.focus(), 50);
      return;
    }
    setAal2Verifying(false);
    await refreshProfile();
    // Session is now AAL2 — proceed with whatever was pending
    const pending = pendingEnrollMethod;
    setPendingEnrollMethod(null);
    if (pending === 'totp') {
      void startTotpEnroll();
    } else if (pending === 'phone') {
      setStep('phone_entry');
    } else {
      setStep('already_enrolled');
    }
  };

  // ─── TOTP enroll ────────────────────────────────────────────────────────
  const startTotpEnroll = async (): Promise<void> => {
    setErrorMsg(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'SBDMM',
      friendlyName: `SBDMM – ${profile?.full_name ?? 'Admin'}`,
    });
    if (error || !data) {
      // Supabase requires AAL2 when the user already has a verified factor
      if (isAal2RequiredError(error?.message ?? '')) {
        await initiateAal2Challenge(factors, 'totp');
        return;
      }
      setStep('error');
      setErrorMsg(friendlyEnrollError(error?.message ?? 'Failed to start TOTP enrollment.', error?.status));
      return;
    }
    setFactorId(data.id);
    setQrUri(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep('totp_qr');
  };

  // ─── Phone enroll + send SMS ─────────────────────────────────────────────
  const startPhoneEnroll = async (): Promise<void> => {
    const phone = phoneNumber.trim();
    if (!phone.match(/^\+[1-9]\d{6,14}$/)) {
      setPhoneError('Enter a valid phone number in international format, e.g. +12125551234');
      return;
    }
    setPhoneError(''); setPhoneEnrolling(true); setErrorMsg(null);

    // Step 1: register the phone factor
    const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'phone',
      phone,
    } as Parameters<typeof supabase.auth.mfa.enroll>[0]);

    if (enrollError || !enrollData) {
      setPhoneEnrolling(false);
      // Supabase requires AAL2 when the user already has a verified factor
      if (isAal2RequiredError(enrollError?.message ?? '')) {
        await initiateAal2Challenge(factors, 'phone');
        return;
      }
      setPhoneError(friendlyEnrollError(enrollError?.message ?? 'Failed to register phone number.', enrollError?.status));
      return;
    }

    const fId = enrollData.id;
    setFactorId(fId);

    // Step 2: create challenge → triggers the SMS
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: fId });
    setPhoneEnrolling(false);
    if (challengeErr || !challengeData) {
      setPhoneError(friendlyEnrollError(challengeErr?.message ?? 'Failed to send SMS. Check Twilio configuration.'));
      return;
    }
    setChallengeId(challengeData.id);
    setOtp('');
    startResendCooldown();
    setStep('phone_verify');
  };

  // Resend SMS
  const resendSms = async (): Promise<void> => {
    if (resendCooldown > 0) return;
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (!error && data) { setChallengeId(data.id); startResendCooldown(); }
  };

  // ─── Unified verify (TOTP and Phone) ─────────────────────────────────────
  const handleVerify = async (): Promise<void> => {
    if (otp.length !== 6) return;
    setVerifying(true); setErrorMsg(null);

    let cId = challengeId;

    // For TOTP: create a fresh challenge here (phone already has one from enroll)
    if (step === 'totp_verify') {
      const { data: cd, error: ce } = await supabase.auth.mfa.challenge({ factorId });
      if (ce || !cd) {
        setErrorMsg(ce?.message ?? 'Failed to create MFA challenge.');
        setVerifying(false);
        return;
      }
      cId = cd.id;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: cId, code: otp });
    if (verifyError) {
      const isTotp = step === 'totp_verify';
      setErrorMsg(
        isTotp
          ? 'Invalid code. Check your authenticator app — codes refresh every 30 s.'
          : 'Invalid code. Check the SMS we sent and try again.',
      );
      setOtp('');
      setVerifying(false);
      setTimeout(() => (document.getElementById('otp-0') as HTMLInputElement | null)?.focus(), 50);
      return;
    }

    await refreshProfile();
    // Re-fetch factors directly from Supabase — no backend required
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const refreshed = toMfaFactors(factorsData?.all ?? []);
    setFactors(refreshed);
    setVerifying(false);
    setStep('success');
  };

  // ─── Remove a factor ─────────────────────────────────────────────────────
  const handleRemoveFactor = async (id: string): Promise<void> => {
    setRemovingId(id); setErrorMsg(null);

    // Prefer client-side unenroll (works when session is AAL2).
    // Falls back to the admin backend API if unavailable.
    const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (unenrollErr) {
      if (isAal2RequiredError(unenrollErr.message)) {
        // Session is only AAL1 — challenge first, then the user can retry
        setRemovingId(null);
        await initiateAal2Challenge(factors);
        return;
      }
      // Last resort: admin backend unenroll
      const fallback = await api.delete(`/api/v1/auth/mfa/unenroll/${encodeURIComponent(id)}`);
      if (!fallback.success) {
        setErrorMsg(fallback.error?.message ?? 'Failed to remove MFA factor.');
        setRemovingId(null);
        return;
      }
    }

    await refreshProfile();
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const newFactors = toMfaFactors(factorsData?.all ?? []);
    setFactors(newFactors);
    setConfirmRemoveId(null);
    if (!newFactors.some(f => f.status === 'verified')) {
      setStep('method_select');
    }
    setRemovingId(null);
  };

  // ─── Check status on mount ───────────────────────────────────────────────
  const checkStatus = useCallback(async (): Promise<void> => {
    try {
      setStep('checking');

      // Both calls go directly to Supabase — no backend API required.
      const [aalResult, factorsResult] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);

      if (factorsResult.error) {
        setStep('error');
        setErrorMsg(factorsResult.error.message ?? 'Failed to retrieve MFA factors.');
        return;
      }

      const allFactors = toMfaFactors(factorsResult.data?.all ?? []);
      setFactors(allFactors);

      const aalData = aalResult.data;
      const hasVerified = allFactors.some(f => f.status === 'verified');

      // If session is AAL1 but verified factors exist, challenge first
      if (aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1' && hasVerified) {
        await initiateAal2Challenge(allFactors);
        return;
      }

      if (hasVerified) { setStep('already_enrolled'); }
      else { setStep('method_select'); }
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { void navigate('/login', { replace: true }); return; }
    void checkStatus();
  }, [authLoading, isAuthenticated, checkStatus, navigate]);

  // ─── Shared card wrapper ─────────────────────────────────────────────────
  const Card = ({ children, maxWidth = 500 }: { children: React.ReactNode; maxWidth?: number }): React.JSX.Element => (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#f0fdf4 0%,#f8fafc 60%,#eff6ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.10)', padding: '40px 44px', width: '100%', maxWidth, position: 'relative' }}>
        <button onClick={() => navigate('/admin')}
          style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22 }} title="Back to Admin">
          <i className="ph ph-arrow-left" />
        </button>
        <div className="d-flex align-items-center gap-10 mb-28" style={{ justifyContent: 'center' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg,#299E60,#1a7a47)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(41,158,96,0.3)' }}>
            <i className="ph ph-shield-check" style={{ fontSize: 26, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a', letterSpacing: '-0.02em' }}>SBDMM</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Super Admin Portal</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );

  // ─── Loading / Checking ─────────────────────────────────────────────────
  if (step === 'loading' || step === 'checking') {
    return (
      <Card>
        <div className="text-center py-4">
          <span className="spinner-border" style={{ color: '#299E60', width: 40, height: 40 }} />
          <div style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>Checking MFA status…</div>
        </div>
      </Card>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <Card>
        <div className="text-center">
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <i className="ph ph-warning-circle" style={{ fontSize: 30, color: '#b91c1c' }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Setup Failed</div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#7f1d1d', textAlign: 'left', marginBottom: 24, lineHeight: 1.65 }}>
            {errorMsg ?? 'An unexpected error occurred.'}
          </div>
          <div className="d-flex gap-10 justify-content-center">
            <button onClick={() => void checkStatus()}
              style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              <i className="ph ph-arrow-clockwise me-2" />Try Again
            </button>
            <button onClick={() => setStep('method_select')}
              style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 20px', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>
              Choose Method
            </button>
          </div>
        </div>
      </Card>
    );
  }

  // ─── AAL2 Challenge (verify existing factor before enrolling another) ────
  if (step === 'aal2_challenge') {
    const aal2Complete = aal2Otp.length === 6;
    const existingFactor = factors.find(f => f.id === aal2FactorId);
    const isPhone = existingFactor?.factor_type === 'phone';
    return (
      <Card>
        <div className="text-center mb-24">
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <i className="ph ph-lock-key" style={{ fontSize: 28, color: '#d97706' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Confirm your identity first</div>
          <div style={{ fontSize: 14, color: '#64748b', maxWidth: 360, margin: '0 auto' }}>
            To add a new MFA factor, Supabase requires you to verify your existing{' '}
            <strong>{isPhone ? 'phone/SMS' : 'authenticator app'}</strong> code first.
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 24 }}>
          <i className="ph ph-info me-2" />
          Open your <strong>{isPhone ? 'SMS messages' : 'authenticator app'}</strong> and enter the current 6-digit code.
        </div>

        <div className="mb-24">
          <OtpInput value={aal2Otp} onChange={setAal2Otp} disabled={aal2Verifying} idPrefix="aal2" />
        </div>

        {aal2ErrorMsg && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ph ph-warning-circle" style={{ fontSize: 16 }} />{aal2ErrorMsg}
          </div>
        )}

        <button onClick={() => void handleAal2Verify()} disabled={!aal2Complete || aal2Verifying}
          style={{ width: '100%', background: aal2Complete ? '#299E60' : '#e2e8f0', color: aal2Complete ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: aal2Complete ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
          {aal2Verifying ? <><span className="spinner-border spinner-border-sm me-2" />Verifying…</> : 'Confirm & Continue'}
        </button>
        <button onClick={() => setStep('already_enrolled')}
          style={{ width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
          ← Back to MFA dashboard
        </button>
      </Card>
    );
  }

  // ─── Method Selection ────────────────────────────────────────────────────
  if (step === 'method_select') {
    const METHOD_OPTIONS: { id: MfaMethod; icon: string; iconBg: string; iconColor: string; title: string; subtitle: string; badges: string[]; recommended?: boolean }[] = [
      {
        id: 'totp',
        icon: 'ph-qr-code',
        iconBg: '#eff6ff',
        iconColor: '#2563eb',
        title: 'Authenticator App',
        subtitle: 'Generate time-based codes with any TOTP app. Works offline. No SMS dependency.',
        badges: ['Google Authenticator', 'Microsoft Authenticator', 'Authy'],
        recommended: true,
      },
      {
        id: 'phone',
        icon: 'ph-device-mobile',
        iconBg: '#f0fdf4',
        iconColor: '#16a34a',
        title: 'Phone / SMS',
        subtitle: 'Receive a one-time code via text message each time you sign in to sensitive areas.',
        badges: ['Quick setup', 'Requires mobile signal', 'Needs Twilio'],
      },
    ];

    return (
      <Card maxWidth={560}>
        <div className="text-center mb-4">
          <Aal2Badge active={false} />
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 6 }}>
            Choose your MFA method
          </div>
          <div style={{ fontSize: 14, color: '#64748b', maxWidth: 400, margin: '0 auto' }}>
            NIST AAL2 requires a second factor. Select how you'd like to authenticate.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {METHOD_OPTIONS.map(opt => {
            const isSelected = selectedMethod === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setMethod(opt.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                  background: isSelected ? '#f0fdf4' : '#f8fafc',
                  border: `2px solid ${isSelected ? '#299E60' : '#e2e8f0'}`,
                  borderRadius: 14, padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s', position: 'relative',
                }}
              >
                {opt.recommended && (
                  <span style={{ position: 'absolute', top: 12, right: 14, background: '#299E60', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 8px', letterSpacing: '0.04em' }}>
                    RECOMMENDED
                  </span>
                )}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: opt.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ph ${opt.icon}`} style={{ fontSize: 22, color: opt.iconColor }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>{opt.title}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>{opt.subtitle}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {opt.badges.map(b => (
                      <span key={b} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 500 }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Radio circle */}
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isSelected ? '#299E60' : '#cbd5e1'}`, background: isSelected ? '#299E60' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* AAL2 explainer */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400e', marginBottom: 24, lineHeight: 1.6 }}>
          <i className="ph ph-info me-2" />
          <strong>Why is this required?</strong> NIST SP 800-63B AAL2 mandates a second authentication factor for privileged admin accounts. Both methods meet this requirement.
        </div>

        <button
          onClick={() => { if (selectedMethod === 'totp') void startTotpEnroll(); else setStep('phone_entry'); }}
          style={{ width: '100%', background: '#299E60', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          Continue with {selectedMethod === 'totp' ? 'Authenticator App' : 'Phone / SMS'} <i className="ph ph-arrow-right ms-2" />
        </button>
      </Card>
    );
  }

  // ─── TOTP: QR Code ──────────────────────────────────────────────────────
  if (step === 'totp_qr') {
    return (
      <Card maxWidth={520}>
        <StepIndicator steps={['Scan QR', 'Verify Code', 'Done']} current={0} />
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Scan with your authenticator app</div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
          Open <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or <strong>Authy</strong>, then tap the <strong>+</strong> button and scan this QR code.
        </div>

        {/* App quick links */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Google Authenticator', color: '#4285F4', bg: '#EBF3FF' },
            { label: 'Microsoft Authenticator', color: '#0078D4', bg: '#E5F2FD' },
            { label: 'Authy', color: '#b91c1c', bg: '#FEF2F2' },
          ].map(app => (
            <span key={app.label} style={{ background: app.bg, color: app.color, border: `1px solid ${app.color}30`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
              {app.label}
            </span>
          ))}
        </div>

        {/* QR */}
        <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          {qrUri ? (
            <img src={qrUri} alt="TOTP QR code" style={{ width: 200, height: 200, imageRendering: 'pixelated', borderRadius: 8 }} />
          ) : (
            <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner-border" style={{ color: '#299E60' }} />
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Can't scan? Use the manual setup key below.</div>
        </div>

        {/* Manual secret */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => setShowSecret(s => !s)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ph ${showSecret ? 'ph-eye-slash' : 'ph-eye'}`} />{showSecret ? 'Hide' : 'Show'} manual key
          </button>
          {showSecret && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontSize: 13, fontFamily: 'monospace', letterSpacing: '0.12em', color: '#0369a1', flex: 1, wordBreak: 'break-all' }}>{secret}</code>
              <button onClick={() => void navigator.clipboard.writeText(secret)} title="Copy"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: 18, padding: 0 }}>
                <i className="ph ph-copy" />
              </button>
            </div>
          )}
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 24 }}>
          <i className="ph ph-info me-2" />A 6-digit code will appear in the app. Codes refresh every <strong>30 seconds</strong>. Click Next to enter it.
        </div>

        <button onClick={() => { setOtp(''); setStep('totp_verify'); }}
          style={{ width: '100%', background: '#299E60', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          Next — Enter Code <i className="ph ph-arrow-right ms-2" />
        </button>
        <button onClick={() => setStep('method_select')}
          style={{ width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
          ← Choose a different method
        </button>
      </Card>
    );
  }

  // ─── TOTP: Verify Code ───────────────────────────────────────────────────
  if (step === 'totp_verify') {
    const isComplete = otp.length === 6;
    return (
      <Card>
        <StepIndicator steps={['Scan QR', 'Verify Code', 'Done']} current={1} />
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Enter the 6-digit code</div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
          Open your authenticator app and enter the current code shown for <strong>SBDMM</strong>.
        </div>
        <div className="mb-28">
          <OtpInput value={otp} onChange={setOtp} disabled={verifying} idPrefix="totp" />
        </div>
        {errorMsg && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ph ph-warning-circle" style={{ fontSize: 16 }} />{errorMsg}
          </div>
        )}
        <button onClick={() => void handleVerify()} disabled={!isComplete || verifying}
          style={{ width: '100%', background: isComplete ? '#299E60' : '#e2e8f0', color: isComplete ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: isComplete ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
          {verifying ? <><span className="spinner-border spinner-border-sm me-2" />Verifying…</> : 'Verify & Activate MFA'}
        </button>
        <button onClick={() => setStep('totp_qr')}
          style={{ width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 12 }}>
          ← Back to QR code
        </button>
      </Card>
    );
  }

  // ─── Phone: Enter Number ─────────────────────────────────────────────────
  if (step === 'phone_entry') {
    return (
      <Card>
        <StepIndicator steps={['Enter Phone', 'Verify SMS', 'Done']} current={0} />
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Enter your phone number</div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
          We'll send a one-time code via SMS each time you access sensitive admin areas.
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Phone number (international format)
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={e => { setPhoneNumber(e.target.value); setPhoneError(''); }}
            placeholder="+12125551234"
            autoFocus
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              border: `2px solid ${phoneError ? '#fca5a5' : '#e2e8f0'}`,
              fontSize: 16, fontFamily: 'monospace', color: '#0f172a', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {phoneError && (
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ph ph-warning-circle" style={{ fontSize: 14 }} />{phoneError}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Include country code, e.g. +44 for UK, +27 for South Africa, +1 for US/Canada.
          </div>
        </div>

        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#0c4a6e', marginBottom: 24 }}>
          <i className="ph ph-info me-2" />Phone MFA requires Twilio to be configured in your Supabase project. If you see an error, use the Authenticator App method instead.
        </div>

        <button onClick={() => void startPhoneEnroll()} disabled={phoneEnrolling || !phoneNumber.trim()}
          style={{ width: '100%', background: phoneNumber.trim() ? '#299E60' : '#e2e8f0', color: phoneNumber.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: phoneNumber.trim() ? 'pointer' : 'not-allowed' }}>
          {phoneEnrolling ? <><span className="spinner-border spinner-border-sm me-2" />Sending SMS…</> : <>Send Verification Code <i className="ph ph-paper-plane-tilt ms-2" /></>}
        </button>
        <button onClick={() => setStep('method_select')}
          style={{ width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
          ← Choose a different method
        </button>
      </Card>
    );
  }

  // ─── Phone: Verify SMS ───────────────────────────────────────────────────
  if (step === 'phone_verify') {
    const isComplete = otp.length === 6;
    return (
      <Card>
        <StepIndicator steps={['Enter Phone', 'Verify SMS', 'Done']} current={1} />
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Enter the SMS code</div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
          We sent a 6-digit code to <strong>{phoneNumber}</strong>. It expires in 10 minutes.
        </div>
        <div className="mb-28">
          <OtpInput value={otp} onChange={setOtp} disabled={verifying} idPrefix="sms" />
        </div>
        {errorMsg && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ph ph-warning-circle" style={{ fontSize: 16 }} />{errorMsg}
          </div>
        )}
        <button onClick={() => void handleVerify()} disabled={!isComplete || verifying}
          style={{ width: '100%', background: isComplete ? '#299E60' : '#e2e8f0', color: isComplete ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: isComplete ? 'pointer' : 'not-allowed', transition: 'all 0.15s', marginBottom: 12 }}>
          {verifying ? <><span className="spinner-border spinner-border-sm me-2" />Verifying…</> : 'Verify & Activate MFA'}
        </button>
        {/* Resend */}
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => void resendSms()} disabled={resendCooldown > 0}
            style={{ background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'default' : 'pointer', color: resendCooldown > 0 ? '#94a3b8' : '#0891b2', fontSize: 13 }}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : <><i className="ph ph-arrow-clockwise me-1" />Resend code</>}
          </button>
        </div>
        <button onClick={() => setStep('phone_entry')}
          style={{ width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
          ← Change phone number
        </button>
      </Card>
    );
  }

  // ─── Already Enrolled (multi-factor dashboard) ───────────────────────────
  if (step === 'already_enrolled') {
    const verifiedFactors = factors.filter(f => f.status === 'verified');
    const aal2Met = verifiedFactors.length > 0;
    const hasBothMethods = verifiedFactors.some(f => f.factor_type === 'totp') && verifiedFactors.some(f => f.factor_type === 'phone');

    const factorMeta = (f: MfaFactor): { icon: string; iconColor: string; iconBg: string; label: string; detail: string } => {
      if (f.factor_type === 'totp') {
        return { icon: 'ph-qr-code', iconColor: '#2563eb', iconBg: '#eff6ff', label: 'Authenticator App (TOTP)', detail: 'Google Authenticator / Microsoft Authenticator / Authy' };
      }
      return { icon: 'ph-device-mobile', iconColor: '#16a34a', iconBg: '#f0fdf4', label: 'Phone / SMS', detail: f.friendly_name ?? 'SMS one-time code' };
    };

    return (
      <Card maxWidth={520}>
        {/* AAL2 status header */}
        <div className="text-center mb-24">
          <Aal2Badge active={aal2Met} />
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 6 }}>
            {aal2Met ? 'MFA Active' : 'MFA Required'}
          </div>
          <div style={{ fontSize: 14, color: '#64748b' }}>
            {aal2Met
              ? `${verifiedFactors.length} verified factor${verifiedFactors.length > 1 ? 's' : ''} protecting your account.`
              : 'Add at least one verified MFA factor to meet AAL2.'}
          </div>
        </div>

        {/* Factor list */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Enrolled Factors
          </div>
          {factors.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 14 }}>No factors enrolled.</div>
          )}
          {factors.map(f => {
            const meta = factorMeta(f);
            const isVerified = f.status === 'verified';
            const isRemoving = removingId === f.id;
            const confirmingRemove = confirmRemoveId === f.id;
            return (
              <div key={f.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                <div className="d-flex align-items-center gap-12">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`ph ${meta.icon}`} style={{ fontSize: 20, color: meta.iconColor }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{meta.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {meta.detail} · Enrolled {new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <span style={{ background: isVerified ? '#f0fdf4' : '#fffbeb', color: isVerified ? '#15803d' : '#92400e', border: `1px solid ${isVerified ? '#bbf7d0' : '#fde68a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {isVerified ? '✓ Verified' : '⏳ Pending'}
                  </span>
                  <button onClick={() => setConfirmRemoveId(confirmingRemove ? null : f.id)}
                    disabled={isRemoving}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, padding: 4, flexShrink: 0 }}
                    title="Remove this factor">
                    <i className={`ph ${confirmingRemove ? 'ph-x' : 'ph-trash'}`} />
                  </button>
                </div>
                {/* Inline confirm remove */}
                {confirmingRemove && (
                  <div style={{ marginTop: 12, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
                    <div style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 10, fontWeight: 600 }}>
                      Remove this {meta.label}?
                    </div>
                    {verifiedFactors.length === 1 && (
                      <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>
                        ⚠️ This is your only verified factor. Removing it will revoke AAL2 status and block admin access.
                      </div>
                    )}
                    {errorMsg && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{errorMsg}</div>}
                    <div className="d-flex gap-8">
                      <button onClick={() => setConfirmRemoveId(null)}
                        style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 0', fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                        Cancel
                      </button>
                      <button onClick={() => void handleRemoveFactor(f.id)} disabled={isRemoving}
                        style={{ flex: 1, background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: isRemoving ? 0.7 : 1 }}>
                        {isRemoving ? <><span className="spinner-border spinner-border-sm me-1" />Removing…</> : 'Yes, Remove'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add another method */}
        {!hasBothMethods && (
          <button onClick={() => setStep('method_select')}
            style={{ width: '100%', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '12px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#475569', marginBottom: 12 }}>
            <i className="ph ph-plus-circle me-2" />Add another MFA method
          </button>
        )}

        <button onClick={() => navigate('/admin')}
          style={{ width: '100%', background: aal2Met ? '#299E60' : '#e2e8f0', color: aal2Met ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: aal2Met ? 'pointer' : 'not-allowed' }}>
          <i className="ph ph-arrow-square-out me-2" />{aal2Met ? 'Enter Admin Portal' : 'Set up MFA to continue'}
        </button>
      </Card>
    );
  }

  // ─── Success ─────────────────────────────────────────────────────────────
  if (step === 'success') {
    const methodLabel = selectedMethod === 'totp' ? 'Authenticator App (TOTP)' : 'Phone / SMS';
    const verifiedCount = factors.filter(f => f.status === 'verified').length;
    return (
      <Card>
        <div className="text-center">
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 6px 20px rgba(34,197,94,0.35)' }}>
            <i className="ph ph-check" style={{ fontSize: 38, color: '#fff' }} />
          </div>
          <div style={{ marginBottom: 10 }}><Aal2Badge active /></div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>MFA Activated!</div>
          <div style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
            <strong>{methodLabel}</strong> is now protecting your account.{' '}
            {verifiedCount > 1 ? `You have ${verifiedCount} active factors.` : ''}
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 28, textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#15803d', marginBottom: 8 }}>✅ What's now protected (AAL2):</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>IP blocking &amp; unblocking</li>
              <li>User role changes &amp; invitations</li>
              <li>Tenant suspension &amp; reinstatement</li>
              <li>All destructive admin operations</li>
            </ul>
          </div>
          <button onClick={() => navigate('/admin')}
            style={{ width: '100%', background: '#299E60', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            <i className="ph ph-arrow-square-out me-2" />Enter Admin Portal
          </button>
          <button onClick={() => setStep('already_enrolled')}
            style={{ width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
            Manage MFA factors →
          </button>
        </div>
      </Card>
    );
  }

  return <></>;
}
