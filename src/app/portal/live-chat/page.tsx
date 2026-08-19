'use client';

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ChatSession = {
  id: string;
  customer_id: string;
  status: "open" | "closed";
  started_at: string;
  updated_at: string;
};

type ChatMessage = {
  id: number;
  session_id: string;
  sender_id: string;
  is_admin: boolean;
  message: string;
  created_at: string;
};

export default function CustomerLiveChatPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = useCallback(async (sessionId: string) => {
    if (!supabase) return;
    const { data, error: fetchError } = await supabase
      .from("live_chat_messages")
      .select("id,session_id,sender_id,is_admin,message,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (fetchError) setError(fetchError.message);
    else setMessages((data as ChatMessage[] | null) ?? []);
  }, [supabase]);

  const findOrCreateSession = useCallback(async (userId: string) => {
    if (!supabase) return null;
    const { data: existing, error: existingError } = await supabase
      .from("live_chat_sessions")
      .select("id,customer_id,status,started_at,updated_at")
      .eq("customer_id", userId)
      .eq("status", "open")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return existing as ChatSession;

    const { data: created, error: createError } = await supabase
      .from("live_chat_sessions")
      .insert({ customer_id: userId })
      .select("id,customer_id,status,started_at,updated_at")
      .single();
    if (createError) throw createError;
    return created as ChatSession;
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    async function boot() {
      const { data, error: authError } = await supabase!.auth.getUser();
      if (!mounted) return;
      if (authError || !data.user) {
        router.replace("/portal/login");
        return;
      }
      setAccount(data.user);
      try {
        const nextSession = await findOrCreateSession(data.user.id);
        if (!mounted || !nextSession) return;
        setSession(nextSession);
        await fetchMessages(nextSession.id);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : "Could not start live chat.");
      }
      if (mounted) setLoading(false);
    }

    void boot();
    return () => { mounted = false; };
  }, [fetchMessages, findOrCreateSession, router, supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    const channel = supabase
      .channel(`customer-live-chat-${session.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_messages", filter: `session_id=eq.${session.id}` }, () => {
        void fetchMessages(session.id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_chat_sessions", filter: `id=eq.${session.id}` }, (payload) => {
        setSession(payload.new as ChatSession);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchMessages, session, supabase]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !account || !draft.trim() || session.status !== "open") return;
    setSending(true);
    setError("");
    const text = draft.trim();
    const { error: sendError } = await supabase.from("live_chat_messages").insert({
      session_id: session.id,
      message: text,
    });
    if (sendError) setError(sendError.message);
    else {
      setDraft("");
      await fetchMessages(session.id);
    }
    setSending(false);
  }

  async function closeChat() {
    if (!supabase || !session || !window.confirm("End this live chat? You can start a new one later.")) return;
    const { error: closeError } = await supabase.from("live_chat_sessions").update({ status: "closed" }).eq("id", session.id);
    if (closeError) setError(closeError.message);
    else setSession({ ...session, status: "closed" });
  }

  async function startNewChat() {
    if (!supabase || !account) return;
    setLoading(true);
    setError("");
    try {
      const nextSession = await findOrCreateSession(account.id);
      setSession(nextSession);
      if (nextSession) await fetchMessages(nextSession.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start a new chat.");
    }
    setLoading(false);
  }

  if (loading) return <section><h1>Live Chat</h1><p className="page-intro">Connecting to Centrum Support...</p></section>;
  if (!supabase) return <section><h1>Live Chat</h1><p className="page-intro">Supabase is not configured.</p></section>;

  return (
    <section className="animate-fade-in live-chat-page">
      <div className="live-chat-header">
        <div>
          <div className="badge badge-pulse page-badge">Centrum Live Support</div>
          <h1>Live Chat</h1>
          <p className="page-intro">Message the Centrum team directly. Replies appear here in real time.</p>
        </div>
        <div className="section-actions" style={{ marginTop: 0 }}>
          <Link href="/portal/dashboard" className="btn btn-secondary">Back to Portal</Link>
          {session?.status === "open" && <button type="button" className="btn btn-secondary" onClick={closeChat}>End Chat</button>}
        </div>
      </div>

      {error && <p className="form-alert form-alert-error">{error}</p>}

      <article className="card chat-shell">
        <div className="chat-status-row">
          <span className={`network-dot ${session?.status === "open" ? "status-dot-optimal" : "status-dot-partial-outage"}`} />
          <strong>{session?.status === "open" ? "Chat open" : "Chat closed"}</strong>
          <span className="field-note">Support replies will appear automatically.</span>
        </div>

        <div className="chat-message-list" aria-live="polite">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <strong>Start the conversation</strong>
              <p>Tell us what you need help with and the support team will see it in the admin inbox.</p>
            </div>
          ) : messages.map((item) => (
            <div className={`chat-message ${item.is_admin ? "chat-message-admin" : "chat-message-customer"}`} key={item.id}>
              <div className="chat-message-meta">
                <strong>{item.is_admin ? "Centrum Support" : "You"}</strong>
                <span>{new Date(item.created_at).toLocaleString()}</span>
              </div>
              <p>{item.message}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {session?.status === "open" ? (
          <form className="chat-composer" onSubmit={sendMessage}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Type your message..." />
            <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>{sending ? "Sending..." : "Send"}</button>
          </form>
        ) : (
          <div className="chat-closed-actions">
            <p className="page-intro">This conversation has ended.</p>
            <button type="button" className="btn btn-primary" onClick={startNewChat}>Start New Chat</button>
          </div>
        )}
      </article>
    </section>
  );
}
