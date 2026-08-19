'use client';

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

export default function NewTicketPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/portal/login");
      } else {
        setUser(data.user);
      }
    });
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;

    setIsSubmitting(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        customer_id: user.id,
        subject: subject.trim(),
        description: description.trim(),
        status: "open",
      })
      .select()
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
    } else if (data) {
      router.push(`/portal/tickets/${data.id}`);
    }
  }

  return (
    <section className="animate-fade-in auth-shell">
      <article className="card auth-card" style={{ gridColumn: "1 / -1" }}>
        <div className="badge badge-pulse page-badge">New Incident Report</div>
        <h1>Report a Connectivity Issue</h1>
        <p className="page-intro">
          Describe the problem in detail. Our NOC team monitors these reports 24/7.
        </p>

        <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: "2rem" }}>
          <label>
            Subject
            <input
              type="text"
              placeholder="e.g., No internet connection, slow speeds at night"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </label>
          <label>
            Description
            <textarea
              placeholder="Please provide more details (when it started, router status, etc.)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              style={{ minHeight: "150px" }}
            />
          </label>

          {errorMessage && <p className="form-alert form-alert-error">{errorMessage}</p>}

          <div className="cta-row">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Submitting Report..." : "Submit Ticket"}
            </button>
            <Link href="/portal/dashboard" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      </article>
    </section>
  );
}
