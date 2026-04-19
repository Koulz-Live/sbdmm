/**
 * MfaSetupPage — Google Authenticator (TOTP) setup for super_admin accounts.
 *
 * FLOW:
 *   1. Check enrollment status via GET /api/v1/auth/mfa-status
 *   2. If not enrolled → call supabase.auth.mfa.enroll() → renders QR code
 *   3. User scans QR with Google Authenticator (or any TOTP app)
 *   4. User enters 6-digit code → supabase.auth.mfa.challenge() + verify()
 *   5. On success → factor status becomes 'verified' → redirect to /admin
 *   6. If already enrolled → show status + option to unenroll (calls DELETE /api/v1/auth/mfa/unenroll)
 *
 * The actual TOTP enroll/verify round-trip uses the browser Supabase client
 * (anon key). The server only *checks* enrollment status via the admin client.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type SetupStep = 'loading' | 'checking' | 'already_enrolled' | 'qr' | 'verify' | 'success' | 'error';

interface MfaFactor {
  id: string;
  factor_type: string;
  status: string;
  created_at: string;
}

// ─── Helper: 6-digit OTP input ───────────────────────────────────────────────
function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }): React.JSX.Element {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number): void => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      const prev = document.getElementById(`otp-${idx - 1}`) as HTMLInputElement | null;
      prev?.focus();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number): void => {
    const raw = e.target.value.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[idx] = raw.slice(-1);
    onChange(newDigits.join(''));
    if (raw && idx < 5) {
      const next = document.getElementById(`otp-${idx + 1}`) as HTMLInputElement | null;
      next?.focus();
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
          id={`otp-${i}`}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MfaSetupPage(): React.JSX.Element {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]             = useState<SetupStep>('loading');
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  // Enroll phase
  const [factorId, setFactorId]     = useState<string>('');
  const [qrUri, setQrUri]           = useState<string>('');
  const [secret, setSecret]         = useState<string>('');
  const [showSecret, setShowSecret] = useState(false);

  // Verify phase
  const [otp, setOtp]               = useState('');
  const [verifying, setVerifying]   = useState(false);

  // Already enrolled
  const [factors, setFactors]       = useState<MfaFactor[]>([]);
  const [unenrolling, setUnenrolling] = useState(false);
  const [confirmUnenroll, setConfirmUnenroll] = useState(false);

  // Check current MFA status on mount
  const checkStatus = useCallback(async (): Promise<void> => {
    setStep('checking');
    const result = await api.get<{ enrolled: boolean; required: boolean; factors: MfaFactor[] }>('/api/v1/auth/mfa-status');
    if (!result.success) { setStep('error'); setErrorMsg(result.error?.message ?? 'Failed to check MFA status.'); return; }

    const { enrolled, factors: f } = result.data!;
    setFactors(f ?? []);
    if (enrolled) { setStep('already_enrolled'); }
    else { void startEnroll(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  // Start the TOTP enroll flow via the Supabase browser client
  const startEnroll = async (): Promise<void> => {
    setErrorMsg(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      // issuer appears as the account name in Google Authenticator
      issuer: 'SBDMM',
      friendlyName: `SBDMM – ${profile?.full_name ?? 'Admin'}`,
    });

    if (error || !data) {
      // "Origin not allowed." is a Supabase Auth error that means the production
      // URL hasn't been added to the Supabase project's URL Configuration.
      // See: Supabase Dashboard → Authentication → URL Configuration
      const isOriginError =
        error?.message?.toLowerCase().includes('origin not allowed') ||
        error?.message?.toLowerCase().includes('origin') ||
        error?.status === 422;

      setStep('error');
      setErrorMsg(
        isOriginError
          ? 'Configuration required: this domain is not authorised in Supabase Auth settings. ' +
            'A project admin must add https://sbdmm.vercel.app to the Supabase Authentication → ' +
            'URL Configuration → Site URL and Redirect URLs, then enable MFA under ' +
            'Authentication → Sign In Methods → MFA.'
          : (error?.message ?? 'Failed to start MFA enrollment. Please try again.'),
      );
      return;
    }

    setFactorId(data.id);
    setQrUri(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep('qr');
  };

  // After scanning QR, user clicks "Next" → move to verify
  const handleProceedToVerify = (): void => { setOtp(''); setStep('verify'); };

  // Issue a challenge then verify the TOTP code
  const handleVerify = async (): Promise<void> => {
    if (otp.length !== 6) return;
    setVerifying(true); setErrorMsg(null);

    // Step 1: create a challenge for the factor
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challengeData) {
      setErrorMsg(challengeError?.message ?? 'Failed to create MFA challenge.');
      setVerifying(false);
      return;
    }

    // Step 2: verify the OTP code against the challenge
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: otp,
    });

    if (verifyError) {
      setErrorMsg('Invalid code. Please check Google Authenticator and try again.');
      setOtp('');
      setVerifying(false);
      // Refocus first digit
      setTimeout(() => (document.getElementById('otp-0') as HTMLInputElement | null)?.focus(), 50);
      return;
    }

    // Refresh auth profile so the MFA flag propagates
    await refreshProfile();
    setStep('success');
    setVerifying(false);
  };

  // Unenroll — calls backend which uses admin client to delete the factor
  const handleUnenroll = async (): Promise<void> => {
    const verifiedFactor = factors.find(f => f.factor_type === 'totp' && f.status === 'verified');
    if (!verifiedFactor) return;

    setUnenrolling(true); setErrorMsg(null);
    const result = await api.delete(`/api/v1/auth/mfa/unenroll/${encodeURIComponent(verifiedFactor.id)}`);
    if (result.success) {
      await refreshProfile();
      void startEnroll();     // restart enrollment flow
      setConfirmUnenroll(false);
    } else {
      setErrorMsg(result.error?.message ?? 'Failed to remove MFA factor.');
    }
    setUnenrolling(false);
  };

  // ─── Shared card wrapper ──────────────────────────────────────────────────
  const Card = ({ children, maxWidth = 480 }: { children: React.ReactNode; maxWidth?: number }): React.JSX.Element => (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 60%, #eff6ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.10)', padding: '40px 44px', width: '100%', maxWidth, position: 'relative' }}>
        {/* Back link */}
        <button onClick={() => navigate('/admin')} style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 22 }} title="Back to Admin">
          <i className="ph ph-arrow-left" />
        </button>

        {/* Brand mark */}
        <div className="d-flex align-items-center gap-10 mb-28" style={{ justifyContent: 'center' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg, #299E60, #1a7a47)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(41,158,96,0.3)' }}>
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

  // ─── Steps ────────────────────────────────────────────────────────────────

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

  if (step === 'error') {
    return (
      <Card>
        <div className="text-center">
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <i className="ph ph-warning-circle" style={{ fontSize: 30, color: '#b91c1c' }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Setup Failed</div>
          <div style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{errorMsg}</div>
          <button onClick={() => void checkStatus()} className="btn btn-sm"
            style={{ background: '#299E60', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 600, fontSize: 14 }}>
            <i className="ph ph-arrow-clockwise me-2" />Try Again
          </button>
        </div>
      </Card>
    );
  }

  if (step === 'already_enrolled') {
    const verifiedFactor = factors.find(f => f.factor_type === 'totp' && f.status === 'verified');
    return (
      <Card>
        <div className="text-center mb-24">
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <i className="ph ph-shield-check" style={{ fontSize: 34, color: '#22c55e' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>MFA is Active</div>
          <div style={{ color: '#64748b', fontSize: 14 }}>Your account is protected with Google Authenticator.</div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Active Factor</div>
          <div className="d-flex align-items-center gap-10">
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ph ph-device-mobile" style={{ fontSize: 18, color: '#0891b2' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>TOTP Authenticator App</div>
              {verifiedFactor && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Enrolled {new Date(verifiedFactor.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
            <span style={{ marginLeft: 'auto', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
              Verified ✓
            </span>
          </div>
        </div>

        <button onClick={() => navigate('/admin')}
          style={{ width: '100%', background: '#299E60', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 12 }}>
          <i className="ph ph-arrow-square-out me-2" />Go to Admin Portal
        </button>

        {/* Unenroll section */}
        {!confirmUnenroll ? (
          <button onClick={() => setConfirmUnenroll(true)}
            style={{ width: '100%', background: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 0', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>
            Remove MFA authenticator
          </button>
        ) : (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#b91c1c', marginBottom: 6 }}>⚠️ Remove Google Authenticator?</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              This will remove TOTP protection from your account. You will need to set it up again before accessing the admin portal.
            </div>
            {errorMsg && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{errorMsg}</div>}
            <div className="d-flex gap-8">
              <button onClick={() => setConfirmUnenroll(false)}
                style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 0', fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                Cancel
              </button>
              <button onClick={() => void handleUnenroll()} disabled={unenrolling}
                style={{ flex: 1, background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: unenrolling ? 0.7 : 1 }}>
                {unenrolling ? <><span className="spinner-border spinner-border-sm me-1" />Removing…</> : 'Yes, Remove'}
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  if (step === 'qr') {
    return (
      <Card maxWidth={520}>
        {/* Step indicator */}
        <div className="d-flex align-items-center gap-0 mb-28">
          {['Scan QR Code', 'Verify Code', 'Done'].map((label, i) => (
            <React.Fragment key={label}>
              <div className="d-flex align-items-center gap-6">
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? '#299E60' : '#e2e8f0', color: i === 0 ? '#fff' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</div>
                <span style={{ fontSize: 12, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#0f172a' : '#94a3b8' }}>{label}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: '#e2e8f0', margin: '0 8px' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Set up Google Authenticator</div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
          Open <strong>Google Authenticator</strong> (or any TOTP app) on your phone and scan the QR code below.
        </div>

        {/* QR Code — rendered as an <img> from Supabase's data URI */}
        <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          {qrUri ? (
            <img
              src={qrUri}
              alt="TOTP QR code for Google Authenticator"
              style={{ width: 200, height: 200, imageRendering: 'pixelated', borderRadius: 8 }}
            />
          ) : (
            <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner-border" style={{ color: '#299E60' }} />
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            Can't scan? Use the setup key below.
          </div>
        </div>

        {/* Manual secret toggle */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => setShowSecret(s => !s)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ph ${showSecret ? 'ph-eye-slash' : 'ph-eye'}`} />{showSecret ? 'Hide' : 'Show'} manual setup key
          </button>
          {showSecret && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontSize: 14, fontFamily: 'monospace', letterSpacing: '0.12em', color: '#0369a1', flex: 1, wordBreak: 'break-all' }}>{secret}</code>
              <button onClick={() => void navigator.clipboard.writeText(secret)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', fontSize: 18, padding: 0 }} title="Copy">
                <i className="ph ph-copy" />
              </button>
            </div>
          )}
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 24 }}>
          <i className="ph ph-info me-2" />After scanning, a 6-digit rotating code will appear in the app. Click <strong>Next</strong> to enter it.
        </div>

        <button onClick={handleProceedToVerify}
          style={{ width: '100%', background: '#299E60', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          Next — Enter Code <i className="ph ph-arrow-right ms-2" />
        </button>
      </Card>
    );
  }

  if (step === 'verify') {
    const isComplete = otp.length === 6;
    return (
      <Card>
        {/* Step indicator */}
        <div className="d-flex align-items-center gap-0 mb-28">
          {['Scan QR Code', 'Verify Code', 'Done'].map((label, i) => (
            <React.Fragment key={label}>
              <div className="d-flex align-items-center gap-6">
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? '#e2e8f0' : i === 1 ? '#299E60' : '#e2e8f0', color: i === 1 ? '#fff' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                  {i === 0 ? <i className="ph ph-check" style={{ fontSize: 13 }} /> : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: i === 1 ? 700 : 400, color: i === 1 ? '#0f172a' : '#94a3b8' }}>{label}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: '#e2e8f0', margin: '0 8px' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Enter the 6-digit code</div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 28 }}>
          Open Google Authenticator and enter the code shown for <strong>SBDMM Admin</strong>.
        </div>

        <div className="mb-28">
          <OtpInput value={otp} onChange={setOtp} disabled={verifying} />
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

        <button onClick={() => setStep('qr')} style={{ width: '100%', background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 12 }}>
          ← Back to QR code
        </button>
      </Card>
    );
  }

  if (step === 'success') {
    return (
      <Card>
        <div className="text-center">
          {/* Animated check */}
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 6px 20px rgba(34,197,94,0.35)' }}>
            <i className="ph ph-check" style={{ fontSize: 38, color: '#fff' }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>MFA Activated! 🎉</div>
          <div style={{ color: '#64748b', fontSize: 14, marginBottom: 28, maxWidth: 340, margin: '0 auto 28px' }}>
            Google Authenticator is now protecting your super admin account. You'll be asked for a code on sensitive actions.
          </div>

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 28, textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#15803d', marginBottom: 6 }}>✅ What's now protected:</div>
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
        </div>
      </Card>
    );
  }

  return <></>;
}
