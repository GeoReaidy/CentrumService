'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type LinkRequest = { id: number; status: 'pending' | 'approved' | 'rejected'; staff_note: string | null; created_at: string };

export function SubscriberLinkCard({ userId, suggestedName = '' }: { userId: string; suggestedName?: string }) {
  const supabase = getSupabaseBrowserClient();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [request, setRequest] = useState<LinkRequest | null>(null);
  const [fullName, setFullName] = useState(suggestedName);
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void Promise.all([
      supabase.from('profiles').select('full_name,phone,subscription_verified').eq('id', userId).single(),
      supabase.from('subscriber_link_requests').select('id,status,staff_note,created_at').eq('requester_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([profileResult, requestResult]) => {
      if (!active) return;
      if (profileResult.data) {
        setVerified(Boolean(profileResult.data.subscription_verified));
        setFullName(profileResult.data.full_name || suggestedName);
        setPhone(profileResult.data.phone || '');
      }
      if (requestResult.data) setRequest(requestResult.data as LinkRequest);
    });
    return () => { active = false; };
  }, [suggestedName, supabase, userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('submit_subscriber_link_request', { p_full_name: fullName, p_phone: phone, p_customer_reference: reference, p_customer_note: note || null });
    if (error) setMessage(error.message);
    else {
      setRequest({ id: Number(data), status: 'pending', staff_note: null, created_at: new Date().toISOString() });
      setMessage('Your request was sent to Centrum staff for verification.');
    }
    setBusy(false);
  }

  if (verified === null) return null;
  if (verified) return <article className="card" id="subscription-link"><div className="badge card-badge">Subscription</div><h2>Centrum service linked</h2><p className="page-intro">This portal account is verified and connected to your Centrum subscription.</p><span className="badge status-active">Verified</span></article>;

  return (
    <article className="card" id="subscription-link">
      <div className="badge card-badge">Subscription</div>
      <h2>Link your Centrum service</h2>
      <p className="page-intro">If Google did not match your existing account email, send your customer details for a secure staff review.</p>
      {request?.status === 'pending' ? <p className="form-alert">Request #{request.id} is awaiting staff review.</p> : (
        <form className="form-grid" onSubmit={submit}>
          <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={160} required /></label>
          <label>Phone number<input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={40} required /></label>
          <label>Customer code or service reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} required /></label>
          <label>Anything staff should know (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} /></label>
          {request?.status === 'rejected' ? <p className="form-alert form-alert-error">The previous request needs attention.{request.staff_note ? ` ${request.staff_note}` : ''}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending...' : 'Request secure linking'}</button>
        </form>
      )}
      {message ? <p className="form-alert">{message}</p> : null}
    </article>
  );
}
