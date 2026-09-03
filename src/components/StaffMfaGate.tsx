'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { resolveUserRole } from '@/lib/supabase-role';

type Mode = 'checking' | 'allowed' | 'enroll' | 'challenge' | 'denied';

export function StaffMfaGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [mode, setMode] = useState<Mode>(() => supabase ? 'checking' : 'denied');
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      if (!userData.user) { router.replace('/portal/login'); setMode('denied'); return; }
      const role = await resolveUserRole(supabase, userData.user);
      if (!active) return;
      if (role !== 'admin' && role !== 'manager') { setMode('allowed'); return; }

      const [{ data: aal, error: aalError }, { data: factors, error: factorError }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (!active) return;
      if (aalError || factorError) {
        setErrorMessage(aalError?.message ?? factorError?.message ?? 'MFA status could not be checked.');
        setMode('denied');
        return;
      }
      if (aal.currentLevel === 'aal2') { setMode('allowed'); return; }
      const verified = factors.totp.find((factor) => factor.status === 'verified');
      if (verified) { setFactorId(verified.id); setMode('challenge'); return; }
      setMode('enroll');
    })();
    return () => { active = false; };
  }, [router, supabase]);

  async function beginEnrollment() {
    if (!supabase || busy) return;
    setBusy(true); setErrorMessage('');
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === 'totp' && factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Centrum staff portal' });
    if (error) setErrorMessage(error.message);
    else {
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    }
    setBusy(false);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !factorId || code.trim().length < 6 || busy) return;
    setBusy(true); setErrorMessage('');
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) { setErrorMessage(challengeError.message); setBusy(false); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
    if (error) { setErrorMessage(error.message); setBusy(false); return; }
    await supabase.auth.refreshSession();
    setMode('allowed'); setBusy(false); router.refresh();
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/portal/login'); router.refresh();
  }

  if (mode === 'allowed') return <>{children}</>;
  if (mode === 'checking') return <section className="security-gate"><article className="card security-gate-card"><h1>Checking staff security</h1><p className="page-intro">Verifying your administrator session.</p></article></section>;

  return (
    <section className="security-gate animate-fade-in">
      <article className="card security-gate-card">
        <div className="badge card-badge">Mandatory Staff Security</div>
        <h1>{mode === 'enroll' ? 'Set up two-step verification' : mode === 'challenge' ? 'Enter your verification code' : 'Staff access is locked'}</h1>
        <p className="page-intro">Administrators and managers must verify with an authenticator app before Centrum data can be opened.</p>

        {mode === 'enroll' && !factorId ? (
          <button type="button" className="btn btn-primary" onClick={() => void beginEnrollment()} disabled={busy}>
            {busy ? 'Preparing...' : 'Set up authenticator app'}
          </button>
        ) : null}

        {mode === 'enroll' && qrCode ? (
          <div className="mfa-enrollment">
            {/* The Supabase TOTP QR is a temporary raw SVG data URI. Next/Image
                rejects that runtime-only format, so a native image is required. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode.trimEnd()} alt="QR code for Centrum staff two-step verification" width={220} height={220} />
            <p>Scan this QR code in Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p>
            <details><summary>Can’t scan it?</summary><code className="mfa-secret">{secret}</code></details>
          </div>
        ) : null}

        {(mode === 'challenge' || qrCode) ? (
          <form className="form-grid" onSubmit={verify}>
            <label>6-digit verification code
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying...' : 'Verify and open console'}</button>
          </form>
        ) : null}

        {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>Sign out</button>
      </article>
    </section>
  );
}
