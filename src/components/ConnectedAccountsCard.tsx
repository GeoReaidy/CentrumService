'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export function ConnectedAccountsCard() {
  const supabase = getSupabaseBrowserClient();
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) setMessage(error.message);
    else setIdentities(data?.identities ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function linkGoogle() {
    if (!supabase) return;
    setBusyProvider('google'); setMessage('');
    const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: `${window.location.origin}/portal/auth/callback` } });
    if (error) { setMessage(error.message); setBusyProvider(''); }
  }

  async function unlink(identity: UserIdentity) {
    if (!supabase || identities.length < 2) return;
    setBusyProvider(identity.provider); setMessage('');
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) setMessage(error.message);
    else { setMessage(`${identity.provider === 'google' ? 'Google' : 'Email'} was disconnected.`); await load(); }
    setBusyProvider('');
  }

  const google = identities.find((identity) => identity.provider === 'google');
  return (
    <article className="card" id="connected-accounts">
      <div className="badge card-badge">Sign-in Security</div>
      <h2>Connected Accounts</h2>
      <p className="page-intro">Manage the secure methods that can sign in to this same Centrum account.</p>
      {loading ? <p className="field-note">Loading connected accounts...</p> : (
        <div className="security-list">
          {identities.map((identity) => (
            <div className="security-list-row" key={identity.id}>
              <div><strong>{identity.provider === 'google' ? 'Google' : 'Email and password'}</strong><small>{String(identity.identity_data?.email ?? '')}</small></div>
              <span className="badge">Connected</span>
              {identities.length > 1 ? <button type="button" className="btn btn-secondary btn-compact" onClick={() => void unlink(identity)} disabled={Boolean(busyProvider)}>Disconnect</button> : null}
            </div>
          ))}
        </div>
      )}
      {!google ? <button type="button" className="btn btn-secondary" onClick={() => void linkGoogle()} disabled={Boolean(busyProvider)}>{busyProvider === 'google' ? 'Opening Google...' : 'Connect Google'}</button> : null}
      <p className="field-note">At least one sign-in method must remain connected.</p>
      {message ? <p className="form-alert">{message}</p> : null}
    </article>
  );
}
