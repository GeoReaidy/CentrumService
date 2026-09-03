'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { LOGIN_DEVICE_STORAGE_KEY } from '@/components/LoginSecurityMonitor';
import { CentrumInlineLoading } from '@/components/CentrumLoading';

type LoginDevice = { id: string; label: string; first_seen_at: string; last_seen_at: string };

export function SecurityDevicesCard() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [devices, setDevices] = useState<LoginDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase.from('login_devices').select('id,label,first_seen_at,last_seen_at').order('last_seen_at', { ascending: false });
    if (error) setMessage(error.message); else setDevices((data as LoginDevice[] | null) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function forget(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('login_devices').delete().eq('id', id);
    if (error) setMessage(error.message); else setDevices((rows) => rows.filter((row) => row.id !== id));
  }

  async function notMe() {
    if (!supabase || !window.confirm('Sign out every Centrum session on every device?')) return;
    setMessage('Signing out every session...');
    window.localStorage.removeItem(LOGIN_DEVICE_STORAGE_KEY);
    await supabase.from('login_devices').delete().not('id', 'is', null);
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) { setMessage(error.message); return; }
    router.replace('/portal/login?security=revoked'); router.refresh();
  }

  return (
    <article className="card" id="login-security">
      <div className="badge card-badge">Login Security</div>
      <h2>Recognized Browsers</h2>
      <p className="page-intro">Centrum records a one-way browser identifier and alerts you the first time a new browser signs in.</p>
      {loading ? <p className="field-note"><CentrumInlineLoading message="Loading recognized browsers..." /></p> : devices.length ? (
        <div className="security-list">
          {devices.map((device) => <div className="security-list-row" key={device.id}><div><strong>{device.label}</strong><small>Last seen {new Date(device.last_seen_at).toLocaleString()}</small></div><button type="button" className="btn btn-secondary btn-compact" onClick={() => void forget(device.id)}>Forget</button></div>)}
        </div>
      ) : <p className="empty-state">No recognized browser has been registered yet.</p>}
      <button type="button" className="btn btn-danger" onClick={() => void notMe()}>This wasn’t me — sign out everywhere</button>
      <p className="field-note">This revokes every refresh token. Existing short-lived access tokens remain valid until they expire.</p>
      {message ? <p className="form-alert">{message}</p> : null}
    </article>
  );
}
