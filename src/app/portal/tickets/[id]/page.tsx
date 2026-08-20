'use client';

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import { AsyncState } from "@/components/AsyncState";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import type { RealtimePostgresChangesPayload, User } from "@supabase/supabase-js";

type TicketUpdate = {
  id: string;
  ticket_id: number;
  message: string;
  created_at: string;
  is_admin: boolean;
};

type TicketData = {
  id: number;
  customer_id: string;
  subject: string;
  status: string;
  description: string;
  created_at: string;
};

function mergeUpdate(list: TicketUpdate[], incoming: TicketUpdate) {
  if (list.some((item) => item.id === incoming.id)) return list;
  return [...list, incoming].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export default function PortalTicketDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const id = params.id;
  const ticketId = Number(id);
  const supabase = getSupabaseBrowserClient();
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [updates, setUpdates] = useState<TicketUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [actionError, setActionError] = useState("");

  const fetchTicketDetails = useCallback(async () => {
    setActionError("");
    if (!supabase || !Number.isFinite(ticketId)) {
      setIsLoading(false);
      return;
    }

    const [ticketResult, updatesResult] = await Promise.all([
      supabase
        .from("tickets")
        .select("id,customer_id,subject,status,description,created_at")
        .eq("id", ticketId)
        .single(),
      supabase
        .from("ticket_updates")
        .select("id,ticket_id,message,created_at,is_admin")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true }),
    ]);

    if (ticketResult.data) setTicket(ticketResult.data as TicketData);
    if (updatesResult.data) setUpdates(updatesResult.data as TicketUpdate[]);

    if (ticketResult.error && ticketResult.error.code !== "PGRST116") {
      console.error("Ticket details load failed", ticketResult.error);
      setActionError(toFriendlyErrorMessage(ticketResult.error, "This ticket could not be loaded right now."));
    } else if (updatesResult.error) {
      console.error("Ticket updates load failed", updatesResult.error);
      setActionError(toFriendlyErrorMessage(updatesResult.error, "Ticket updates could not be loaded right now."));
    }

    setIsLoading(false);
  }, [supabase, ticketId]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function initialize() {
      const { data, error } = await supabase!.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        setUser(null);
        setAuthReady(true);
        setIsLoading(false);
        return;
      }

      setUser(data.user);
      const admin = await resolveIsAdmin(supabase!, data.user);
      if (cancelled) return;

      setIsAdmin(admin);
      setAuthReady(true);
      await fetchTicketDetails();
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [fetchTicketDetails, supabase]);

  useEffect(() => {
    if (!supabase || !authReady || !user || !Number.isFinite(ticketId)) return;

    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_updates",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload: RealtimePostgresChangesPayload<TicketUpdate>) => {
          const incoming = payload.new as TicketUpdate;
          if (incoming?.id) {
            setUpdates((current) => mergeUpdate(current, incoming));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `id=eq.${ticketId}`,
        },
        (payload: RealtimePostgresChangesPayload<TicketData>) => {
          const incoming = payload.new as TicketData;
          if (incoming?.id) setTicket(incoming);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setActionError("Live ticket updates are temporarily unavailable. Retry the ticket or refresh the page.");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authReady, supabase, ticketId, user]);

  useEffect(() => {
    if (!supabase || !user || !ticket) return;
    const href = `/portal/tickets/${ticketId}`;
    void supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .eq("category", "tickets")
      .eq("href", href)
      .is("read_at", null)
      .then(({ error }) => {
        if (error && error.code !== "42P01") console.error("Ticket notification acknowledgement failed", error);
      });
  }, [supabase, ticket, ticketId, user]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const message = newMessage.trim();
    if (!supabase || !user || !authReady || !message || !Number.isFinite(ticketId)) return;

    setIsSending(true);
    setMessageError("");

    const { data: newUpdate, error } = await supabase
      .from("ticket_updates")
      .insert({
        ticket_id: ticketId,
        message,
      })
      .select("id,ticket_id,message,created_at,is_admin")
      .single();

    if (error) {
      setMessageError(toFriendlyErrorMessage(error, "Your update could not be sent. Please try again."));
      setIsSending(false);
      return;
    }

    if (newUpdate) {
      setUpdates((current) => mergeUpdate(current, newUpdate as TicketUpdate));
      setNewMessage("");
    }

    if (isAdmin && ticket?.status === "open") {
      const { data: updatedTicket, error: statusError } = await supabase
        .from("tickets")
        .update({ status: "in_progress" })
        .eq("id", ticketId)
        .select("id,customer_id,subject,status,description,created_at")
        .single();

      if (statusError) {
        setActionError(toFriendlyErrorMessage(statusError, "Your update was sent, but the ticket status could not be refreshed."));
      } else if (updatedTicket) {
        setTicket(updatedTicket as TicketData);
      }
    }

    setIsSending(false);
  }

  async function markResolved() {
    if (!supabase || !ticket || !isAdmin) return;

    setActionError("");
    const { data, error } = await supabase
      .from("tickets")
      .update({ status: "resolved" })
      .eq("id", ticketId)
      .select("id,customer_id,subject,status,description,created_at")
      .single();

    if (error) {
      setActionError(toFriendlyErrorMessage(error, "The ticket status could not be changed. Please try again."));
      return;
    }

    if (data) setTicket(data as TicketData);
  }

  if (isLoading || !authReady) {
    return <section><AsyncState kind="loading" eyebrow="Support Ticket" title="Loading ticket" message="Checking access and loading the latest support updates." /></section>;
  }

  if (!user) {
    return <section><AsyncState kind="empty" eyebrow="Sign In Required" title="Sign in to view this ticket" message="Support tickets are private to your account." href="/portal/login" hrefLabel="Sign In" /></section>;
  }

  if (!ticket) {
    return (
      <section>
        <AsyncState
          kind={actionError ? "error" : "empty"}
          eyebrow="Support Ticket"
          title={actionError ? "We couldn't load this ticket" : "Ticket not found"}
          message={actionError || "The requested ticket doesn't exist or your account doesn't have access to it."}
          onRetry={actionError ? () => void fetchTicketDetails() : undefined}
          href="/portal/dashboard"
          hrefLabel="Back to Dashboard"
        />
      </section>
    );
  }

  return (
    <section className="animate-fade-in">
      <div className="badge badge-pulse page-badge">Incident ID: #{id}</div>
      <h1>{ticket.subject}</h1>
      <p className="page-intro">
        Status: <span className={`status-pill status-${ticket.status}`}>{ticket.status.replace("_", " ")}</span>
      </p>

      {actionError ? <AsyncState kind="error" eyebrow="Ticket Data" title="Some ticket information needs another try" message={actionError} onRetry={() => void fetchTicketDetails()} retryLabel="Retry Ticket" /> : null}

      <div className="section-grid">
        <article className="card" style={{ gridColumn: "span 2" }}>
          <div className="badge card-badge">Update Feed</div>
          <div className="update-feed" style={{ marginTop: "1rem", maxHeight: "400px", overflowY: "auto" }}>
            <div className="update-bubble update-bubble-customer">
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Reported on {new Date(ticket.created_at).toLocaleString()}</p>
              <p style={{ marginTop: "0.5rem" }}>{ticket.description}</p>
            </div>
            {updates.map((update) => (
              <div
                key={update.id}
                className={`update-bubble ${update.is_admin ? "update-bubble-admin" : "update-bubble-customer"}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                  <span className="badge" style={{ fontSize: "0.6rem" }}>{update.is_admin ? "Support Engineer" : "Customer"}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{new Date(update.created_at).toLocaleString()}</span>
                </div>
                <p>{update.message}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendMessage} className="form-grid" style={{ marginTop: "1.5rem" }}>
            <label>
              Add Update
              <textarea
                placeholder={isAdmin ? "Inform the customer about progress or a fix..." : "Provide more details about the issue..."}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                style={{ minHeight: "80px" }}
                required
              />
            </label>
            {messageError && <p className="form-alert form-alert-error">{messageError}</p>}
            <button type="submit" className="btn btn-primary" disabled={isSending || !authReady}>
              {isSending ? "Transmitting..." : "Send Update"}
            </button>
          </form>
        </article>

        <article className="card">
          <div className="badge card-badge">Actions</div>
          <h2>Management</h2>
          {actionError && <p className="form-alert form-alert-error">{actionError}</p>}
          <div className="section-actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
            {isAdmin && ticket.status !== "resolved" && (
              <button className="btn btn-primary" onClick={() => void markResolved()}>
                Mark as Resolved
              </button>
            )}
            <Link href={isAdmin ? "/admin" : "/portal/dashboard"} className="btn btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
