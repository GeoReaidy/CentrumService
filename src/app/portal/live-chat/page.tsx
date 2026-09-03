'use client';

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { AsyncState } from "@/components/AsyncState";
import { CentrumLoadingScreen } from "@/components/CentrumLoading";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import { useLanguage } from "@/components/LanguageProvider";
import { localizedDateLocale } from "@/lib/i18n";
import { translateUiText } from "@/lib/ui-translations";

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
  const { locale } = useLanguage();
  const [account, setAccount] = useState<User | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const sessionId = session?.id ?? null;

  const fetchMessages = useCallback(async (sessionId: string) => {
    if (!supabase) return;
    const { data, error: fetchError } = await supabase
      .from("live_chat_messages")
      .select("id,session_id,sender_id,is_admin,message,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("Customer live chat messages load failed", fetchError);
      setError(toFriendlyErrorMessage(fetchError, "Chat messages could not be loaded right now."));
      return;
    }

    setMessages((data as ChatMessage[] | null) ?? []);
  }, [supabase]);

  const refreshSession = useCallback(async (sessionId: string) => {
    if (!supabase) return null;
    const { data, error: sessionError } = await supabase
      .from("live_chat_sessions")
      .select("id,customer_id,status,started_at,updated_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      console.error("Customer live chat session refresh failed", sessionError);
      return null;
    }

    const nextSession = (data as ChatSession | null) ?? null;
    if (nextSession) setSession(nextSession);
    return nextSession;
  }, [supabase]);

  const refreshConversation = useCallback(async (sessionId: string) => {
    const nextSession = await refreshSession(sessionId);
    await fetchMessages(sessionId);
    if (nextSession) setError("");
    return nextSession;
  }, [fetchMessages, refreshSession]);

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
        if (mounted) {
          console.error("Customer live chat start failed", cause);
          setError(toFriendlyErrorMessage(cause, "Could not start live chat right now."));
        }
      }
      if (mounted) setLoading(false);
    }

    void boot();
    return () => { mounted = false; };
  }, [fetchMessages, findOrCreateSession, router, supabase]);

  useEffect(() => {
    if (!supabase || !sessionId) return;
    const channel = supabase
      .channel(`customer-live-chat-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_messages", filter: `session_id=eq.${sessionId}` }, () => {
        void fetchMessages(sessionId);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_chat_sessions", filter: `id=eq.${sessionId}` }, (payload) => {
        setSession(payload.new as ChatSession);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeDegraded(false);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtimeDegraded(true);
      });

    return () => { void supabase.removeChannel(channel); };
  }, [fetchMessages, sessionId, supabase]);

  // Realtime is the fast path. This lightweight refresh is the reliability path:
  // it catches a support-side close even if the browser missed a Realtime event.
  useEffect(() => {
    if (!sessionId) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refreshConversation(sessionId);
    };

    const interval = window.setInterval(refreshIfVisible, 15000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refreshConversation, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !account || !draft.trim()) return;

    setSending(true);
    setError("");

    // Do not trust a stale browser copy of session.status. Support may have closed
    // the conversation while this tab was in the background.
    const currentSession = await refreshSession(session.id);
    if (!currentSession || currentSession.status !== "open") {
      if (currentSession) setSession(currentSession);
      setError("This conversation was closed by support. Start a new chat to keep talking.");
      setSending(false);
      return;
    }

    const text = draft.trim();
    const { error: sendError } = await supabase.from("live_chat_messages").insert({
      session_id: currentSession.id,
      message: text,
    });

    if (sendError) {
      console.error("Customer live chat message send failed", sendError);
      const latestSession = await refreshSession(currentSession.id);
      if (latestSession?.status === "closed") {
        setError("This conversation was closed by support. Start a new chat to keep talking.");
      } else {
        setError(toFriendlyErrorMessage(sendError, "Your message could not be sent. Please try again."));
      }
    } else {
      setDraft("");
      await fetchMessages(currentSession.id);
    }

    setSending(false);
  }

  async function closeChat() {
    if (!supabase || !session || !window.confirm(translateUiText("End this live chat? You can start a new one later.", locale))) return;
    const { error: closeError } = await supabase.from("live_chat_sessions").update({ status: "closed" }).eq("id", session.id);
    if (closeError) {
      setError(toFriendlyErrorMessage(closeError, "The chat could not be closed. Please try again."));
    } else {
      setSession({ ...session, status: "closed" });
      setError("");
    }
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
      console.error("Customer new live chat failed", cause);
      setError(toFriendlyErrorMessage(cause, "Could not start a new chat right now."));
    }
    setLoading(false);
  }

  if (loading) return <CentrumLoadingScreen context="Centrum Live Support" message="Opening your conversation and loading recent messages." />;
  if (!supabase) return <section className="live-chat-page"><AsyncState kind="error" eyebrow="Live Support" title="Live chat is temporarily unavailable" message="Centrum couldn't connect to live support right now." href="/contact" hrefLabel="Contact Centrum" /></section>;

  return (
    <section className="animate-fade-in live-chat-page live-chat-surface">
      <div className="live-chat-header">
        <div>
          <div className="badge badge-pulse page-badge">Support Desk · Live</div>
          <h1>Live Chat</h1>
          <p className="page-intro">Message the Centrum team directly. Replies appear here in real time.</p>
        </div>
        <div className="section-actions" style={{ marginTop: 0 }}>
          <Link href="/portal/dashboard" className="btn btn-secondary">Back to Portal</Link>
          {session?.status === "open" && <button type="button" className="btn btn-secondary" onClick={closeChat}>End Chat</button>}
        </div>
      </div>

      {error ? (
        <div className="live-chat-inline-error" role="alert">
          <div>
            <strong>Chat needs attention</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => session ? void refreshConversation(session.id) : void startNewChat()}>
            Retry
          </button>
        </div>
      ) : null}

      <article className="card chat-shell live-chat-thread-card">
        <div className="chat-status-row">
          <span className={`network-dot ${session?.status === "open" ? "status-dot-optimal" : "status-dot-partial-outage"}`} />
          <div className="chat-status-copy">
            <strong>{session?.status === "open" ? "Chat open" : "Chat closed"}</strong>
            <span className="field-note">
              {realtimeDegraded ? "Live updates are reconnecting; Centrum is checking periodically." : "Support replies will appear automatically."}
            </span>
          </div>
        </div>

        <div className="chat-message-list" aria-live="polite">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <strong>Start the conversation</strong>
              <p>Tell us what you need help with and the support team will see it in the admin inbox.</p>
            </div>
          ) : messages.map((item) => {
            const ownMessage = !item.is_admin;
            return (
              <div className={`chat-message ${ownMessage ? "chat-message-own" : "chat-message-other"}`} key={item.id}>
                <div className="chat-message-meta">
                  <strong>{ownMessage ? "You" : "Centrum Support"}</strong>
                  <span>{new Date(item.created_at).toLocaleString(localizedDateLocale(locale))}</span>
                </div>
                <p>{item.message}</p>
              </div>
            );
          })}
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
