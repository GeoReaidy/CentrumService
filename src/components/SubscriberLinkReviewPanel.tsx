'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { CentrumInlineLoading } from '@/components/CentrumLoading';

type RequestRow = { id: number; requester_id: string; full_name: string; phone: string; customer_reference: string; customer_note: string | null; status: string; staff_note: string | null; created_at: string };

export function SubscriberLinkReviewPanel() {
  const supabase = getSupabaseBrowserClient();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase.from('subscriber_link_requests').select('id,requester_id,full_name,phone,customer_reference,customer_note,status,staff_note,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) setMessage(error.message); else setRequests((data as RequestRow[] | null) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function review(id: number, decision: 'approved' | 'rejected') {
    if (!supabase || busyId) return;
    if (decision === 'approved' && !window.confirm('Approve this request and mark the portal subscription as verified?')) return;
    setBusyId(id); setMessage('');
    const { error } = await supabase.rpc('review_subscriber_link_request', { p_request_id: id, p_decision: decision, p_staff_note: notes[id] || null });
    if (error) setMessage(error.message); else { setMessage(`Request #${id} ${decision}.`); await load(); }
    setBusyId(null);
  }

  return (
    <article className="card">
      <div className="badge card-badge">Staff Verification</div>
      <h2>Subscriber Link Requests</h2>
      <p className="page-intro">Verify the customer against Centrum records before approving. The submitted code and phone number are identifiers, not proof by themselves.</p>
      {loading ? <p className="field-note"><CentrumInlineLoading message="Loading requests..." /></p> : requests.length ? (
        <div className="review-list">
          {requests.map((request) => <section className="review-request" key={request.id}>
            <div className="review-request-heading"><strong>#{request.id} · {request.full_name}</strong><span className={`badge ${request.status === 'approved' ? 'status-active' : request.status === 'rejected' ? 'status-inactive' : ''}`}>{request.status}</span></div>
            <div className="dashboard-detail-list"><span><strong>Phone:</strong> {request.phone}</span><span><strong>Reference:</strong> {request.customer_reference}</span><span><strong>Submitted:</strong> {new Date(request.created_at).toLocaleString()}</span>{request.customer_note ? <span><strong>Customer note:</strong> {request.customer_note}</span> : null}</div>
            {request.status === 'pending' ? <><label>Staff note (recommended for rejection)<textarea rows={2} maxLength={1000} value={notes[request.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} /></label><div className="button-row"><button className="btn btn-primary" type="button" onClick={() => void review(request.id, 'approved')} disabled={busyId === request.id}>Approve</button><button className="btn btn-danger" type="button" onClick={() => void review(request.id, 'rejected')} disabled={busyId === request.id}>Reject</button></div></> : null}
          </section>)}
        </div>
      ) : <p className="empty-state">There are no subscriber link requests.</p>}
      {message ? <p className="form-alert">{message}</p> : null}
    </article>
  );
}
