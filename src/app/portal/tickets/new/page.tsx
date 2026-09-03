"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { AsyncState } from "@/components/AsyncState";
import { CentrumLoadingScreen } from "@/components/CentrumLoading";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";

export default function NewTicketPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(() => Boolean(supabase));
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let mounted = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error || !data.user) {
        if (error) console.error("New ticket auth check failed", error);
        setUser(null);
        setAuthLoading(false);
        return;
      }
      setUser(data.user);
      setAuthLoading(false);
    });
    return () => { mounted = false; };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !user || !subject.trim() || !description.trim()) return;

    setIsSubmitting(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        customer_id: user.id,
        subject: subject.trim(),
        description: description.trim(),
        status: "open",
        priority: "normal",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Ticket creation failed", error);
      setErrorMessage(toFriendlyErrorMessage(error, "We couldn't create your ticket right now. Please try again."));
      setIsSubmitting(false);
      return;
    }

    if (data?.id) router.push(`/portal/tickets/${data.id}`);
    else {
      setErrorMessage("The ticket was submitted, but Centrum couldn't open it automatically. Return to the dashboard and check your tickets.");
      setIsSubmitting(false);
    }
  }

  if (authLoading) return <CentrumLoadingScreen context="Centrum Support" message="Checking your account before opening the support form." />;
  if (!supabase) return <section><AsyncState kind="error" eyebrow="Support" title="Ticket service is temporarily unavailable" message="Centrum couldn't connect to support right now." href="/contact" hrefLabel="Contact Centrum" /></section>;
  if (!user) return <section><AsyncState kind="empty" eyebrow="Sign In Required" title="Sign in to open a support ticket" message="Support tickets are linked to your Centrum account so you can follow replies and status changes." href="/portal/login" hrefLabel="Sign In" /></section>;

  return (
    <section className="animate-fade-in auth-shell">
      <article className="card auth-card" style={{ gridColumn: "1 / -1" }}>
        <div className="badge badge-pulse page-badge">New Incident Report</div>
        <h1>Report a Connectivity Issue</h1>
        <p className="page-intro">Describe the problem in detail. Our support team will receive the report in the admin dashboard.</p>

        <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: "2rem" }}>
          <label>Subject<input type="text" placeholder="e.g., No internet connection, slow speeds at night" value={subject} onChange={(e) => setSubject(e.target.value)} required /></label>
          <label>Description<textarea placeholder="Please provide more details (when it started, router status, etc.)" value={description} onChange={(e) => setDescription(e.target.value)} required style={{ minHeight: "150px" }} /></label>
          {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}
          <div className="cta-row">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? "Submitting Report..." : "Submit Ticket"}</button>
            <Link href="/portal/dashboard" className="btn btn-secondary">Cancel</Link>
          </div>
        </form>
      </article>
    </section>
  );
}
