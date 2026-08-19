'use client';

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";

type ChatSession = { id: string; customer_id: string; status: "open" | "closed"; started_at: string; updated_at: string };
type ChatMessage = { id: number; session_id: string; sender_id: string; is_admin: boolean; message: string; created_at: string };
type Customer = { id: string; full_name: string | null; phone: string | null };

export default function AdminLiveChatPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionStatusFilter, setSessionStatusFilter] = useState("all");
  const [sessionSort, setSessionSort] = useState("recent");

  const fetchSessions = useCallback(async () => {
    if (!supabase) return;
    const [sessionsResult, customersResult] = await Promise.all([
      supabase.from("live_chat_sessions").select("id,customer_id,status,started_at,updated_at").order("updated_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id,full_name,phone").order("full_name", { ascending: true }).limit(300),
    ]);
    const firstError = sessionsResult.error || customersResult.error;
    if (firstError) setError(firstError.message);
    else setError("");
    const nextSessions = (sessionsResult.data as ChatSession[] | null) ?? [];
    setSessions(nextSessions);
    setCustomers((customersResult.data as Customer[] | null) ?? []);
    setSelectedId((current) => current ?? nextSessions.find((item) => item.status === "open")?.id ?? nextSessions[0]?.id ?? null);
  }, [supabase]);

  const fetchMessages = useCallback(async (sessionId: string) => {
    if (!supabase) return;
    const { data, error: fetchError } = await supabase.from("live_chat_messages").select("id,session_id,sender_id,is_admin,message,created_at").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (fetchError) setError(fetchError.message);
    else setMessages((data as ChatMessage[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    async function boot() {
      const { data, error: authError } = await supabase!.auth.getUser();
      if (!mounted) return;
      if (authError || !data.user) { router.replace("/portal/login"); return; }
      const admin = await resolveIsAdmin(supabase!, data.user);
      if (!mounted) return;
      if (!admin) { router.replace("/portal/dashboard"); return; }
      setAccount(data.user);
      await fetchSessions();
      if (mounted) setLoading(false);
    }
    void boot();
    return () => { mounted = false; };
  }, [fetchSessions, router, supabase]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    void fetchMessages(selectedId);
  }, [fetchMessages, selectedId]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("admin-live-chat-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_sessions" }, () => { void fetchSessions(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_messages" }, (payload) => {
        void fetchSessions();
        const row = (payload.new || payload.old) as Partial<ChatMessage>;
        if (selectedId && row.session_id === selectedId) void fetchMessages(selectedId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchMessages, fetchSessions, selectedId, supabase]);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const visibleSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    return [...sessions].filter((item) => {
      const customer = customerMap.get(item.customer_id);
      const matchesSearch = !query || `${customer?.full_name ?? ""} ${customer?.phone ?? ""} ${item.customer_id}`.toLowerCase().includes(query);
      return matchesSearch && (sessionStatusFilter === "all" || item.status === sessionStatusFilter);
    }).sort((a, b) => {
      if (sessionSort === "oldest") return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      if (sessionSort === "name") return (customerMap.get(a.customer_id)?.full_name ?? a.customer_id).localeCompare(customerMap.get(b.customer_id)?.full_name ?? b.customer_id);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [sessions, customerMap, sessionSearch, sessionStatusFilter, sessionSort]);
  const selected = sessions.find((item) => item.id === selectedId) ?? null;

  function customerName(customerId: string) {
    return customerMap.get(customerId)?.full_name || `${customerId.slice(0, 8)}…`;
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selected || selected.status !== "open" || !draft.trim()) return;
    setSending(true);
    setError("");
    const { error: sendError } = await supabase.from("live_chat_messages").insert({ session_id: selected.id, message: draft.trim() });
    if (sendError) setError(sendError.message);
    else { setDraft(""); await fetchMessages(selected.id); await fetchSessions(); }
    setSending(false);
  }

  async function setChatStatus(status: "open" | "closed") {
    if (!supabase || !selected) return;
    const { error: updateError } = await supabase.from("live_chat_sessions").update({ status }).eq("id", selected.id);
    if (updateError) setError(updateError.message);
    else await fetchSessions();
  }

  if (loading) return <section><h1>Live Chat Inbox</h1><p className="page-intro">Checking admin access...</p></section>;
  if (!supabase) return <section><h1>Live Chat Inbox</h1><p className="page-intro">Supabase is not configured.</p></section>;
  if (!account) return <section><h1>Live Chat Inbox</h1><p className="page-intro">Redirecting...</p></section>;

  return (
    <section className="animate-fade-in admin-page">
      <div className="admin-header">
        <div>
          <div className="badge badge-pulse page-badge">Support Desk · Live</div>
          <h1>Live Chat Inbox</h1>
          <p className="page-intro">Handle customer conversations in real time from one place.</p>
        </div>
        <div className="section-actions" style={{ marginTop: 0 }}>
          <Link href="/admin" className="btn btn-secondary">Admin Dashboard</Link>
          <Link href="/admin/operations" className="btn btn-secondary">Customer Operations</Link>
        </div>
      </div>

      {error && <p className="form-alert form-alert-error">{error}</p>}

      <div className="admin-chat-layout">
        <aside className="card admin-chat-inbox">
          <div className="admin-chat-inbox-heading">
            <div>
              <div className="badge card-badge">Conversations</div>
              <h2>Customer chats</h2>
            </div>
            <span className="badge">{sessions.filter((item) => item.status === "open").length} open</span>
          </div>

          <div className="list-toolbar chat-list-toolbar">
            <input className="admin-search" value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="Search customer or phone..." />
            <select value={sessionStatusFilter} onChange={(event) => setSessionStatusFilter(event.target.value)}><option value="all">All chats</option><option value="open">Open</option><option value="closed">Closed</option></select>
            <select value={sessionSort} onChange={(event) => setSessionSort(event.target.value)}><option value="recent">Most recent</option><option value="oldest">Oldest activity</option><option value="name">Customer A–Z</option></select>
          </div>

          <div className="admin-chat-session-list fixed-scroll-list">
            {visibleSessions.length === 0 ? <p className="page-intro">No chats match the current search or filters.</p> : visibleSessions.map((item) => (
              <button type="button" className={`admin-chat-session ${selectedId === item.id ? "active" : ""}`} onClick={() => setSelectedId(item.id)} key={item.id}>
                <span className={`network-dot ${item.status === "open" ? "status-dot-optimal" : "status-dot-partial-outage"}`} />
                <span>
                  <strong>{customerName(item.customer_id)}</strong>
                  <small>{item.status === "open" ? "Open" : "Closed"} · {new Date(item.updated_at).toLocaleString()}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <article className="card admin-chat-thread">
          {!selected ? (
            <div className="chat-empty-state"><strong>Select a conversation</strong><p>Open a customer chat from the inbox to read and reply.</p></div>
          ) : (
            <>
              <div className="admin-chat-thread-header">
                <div>
                  <div className="badge card-badge">{selected.status === "open" ? "Open Chat" : "Closed Chat"}</div>
                  <h2>{customerName(selected.customer_id)}</h2>
                  {customerMap.get(selected.customer_id)?.phone && <p className="field-note">{customerMap.get(selected.customer_id)?.phone}</p>}
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => setChatStatus(selected.status === "open" ? "closed" : "open")}>
                  {selected.status === "open" ? "Close Chat" : "Reopen Chat"}
                </button>
              </div>

              <div className="chat-message-list admin-chat-messages">
                {messages.length === 0 ? <div className="chat-empty-state"><p>No messages in this conversation yet.</p></div> : messages.map((item) => (
                  <div className={`chat-message ${item.is_admin ? "chat-message-admin" : "chat-message-customer"}`} key={item.id}>
                    <div className="chat-message-meta"><strong>{item.is_admin ? "You / Centrum" : customerName(selected.customer_id)}</strong><span>{new Date(item.created_at).toLocaleString()}</span></div>
                    <p>{item.message}</p>
                  </div>
                ))}
              </div>

              {selected.status === "open" && (
                <form className="chat-composer" onSubmit={sendReply}>
                  <textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Reply to the customer..." />
                  <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>{sending ? "Sending..." : "Send Reply"}</button>
                </form>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
