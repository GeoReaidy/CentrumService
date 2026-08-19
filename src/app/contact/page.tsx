'use client';

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function ContactPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAccount(data.user ?? null);
      if (data.user?.email) setEmail((current) => current || data.user!.email!);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAccount(session?.user ?? null);
      if (session?.user?.email) setEmail((current) => current || session.user.email!);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setFormError("Contact form is unavailable because Supabase is not configured.");
      return;
    }
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setFormError("Please fill in your name, email, subject, and message.");
      return;
    }

    setSending(true);
    setFormError("");
    setFormMessage("");

    const { error } = await supabase.from("contact_inquiries").insert({
      customer_id: account?.id ?? null,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      subject: subject.trim(),
      message: message.trim(),
    });

    if (error) {
      setFormError(error.message);
    } else {
      setSubject("");
      setMessage("");
      setFormMessage("Message sent. Centrum Support can now follow up with you.");
    }
    setSending(false);
  }

  function startLiveChat() {
    if (account) {
      router.push("/portal/live-chat");
    } else {
      router.push("/portal/login");
    }
  }

  return (
    <section className="animate-fade-in contact-page">
      <div className="contact-hero">
        <div className="badge badge-pulse page-badge">Direct Line · Centrum Support</div>
        <h1>Talk to a real local support team</h1>
        <p className="page-intro contact-intro">
          Questions about coverage, a new subscription, billing, or a technical issue? Choose the fastest way to reach us.
        </p>
        <div className="section-actions contact-hero-actions">
          <button type="button" className="btn btn-primary" onClick={startLiveChat}>
            Start Live Chat
          </button>
          <a className="btn btn-secondary" href="tel:+96103822947">Call Centrum</a>
        </div>
        {!account && (
          <p className="field-note contact-login-note">
            Live chat is available to signed-in customers. <Link href="/portal/login" className="text-link">Sign in</Link> or use the message form below.
          </p>
        )}
      </div>

      <div className="contact-method-grid">
        <article className="card contact-method-card">
          <div className="badge card-badge">Phone</div>
          <h2>Call us directly</h2>
          <p>Best for urgent service questions during office hours.</p>
          <a className="contact-value" href="tel:+96103822947">+961 03 822 947</a>
        </article>

        <article className="card contact-method-card">
          <div className="badge card-badge">Email</div>
          <h2>Send an email</h2>
          <p>Useful for account questions, documents, or anything that needs detail.</p>
          <a className="contact-value" href="mailto:tonyreaidy@live.com">tonyreaidy@live.com</a>
        </article>

        <article className="card contact-method-card">
          <div className="badge card-badge">Hours</div>
          <h2>Operations desk</h2>
          <p>Monday – Saturday</p>
          <strong className="contact-value">08:00 – 18:00</strong>
        </article>
      </div>

      <div className="contact-main-grid">
        <article className="card contact-form-card">
          <div className="badge card-badge">Send a Message</div>
          <h2>Tell us what you need</h2>
          <p className="page-intro">You do not need a customer account to send this form.</p>

          <form className="form-grid contact-form" onSubmit={submitInquiry}>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </label>
            <label>
              Phone <span className="field-note">optional</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+961 ..." autoComplete="tel" />
            </label>
            <label>
              Subject
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Coverage, billing, technical support..." required />
            </label>
            <label className="contact-message-field">
              Message
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe your question or issue..." rows={6} required />
            </label>

            {formError && <p className="form-alert form-alert-error">{formError}</p>}
            {formMessage && <p className="form-alert form-alert-success">{formMessage}</p>}

            <div className="section-actions">
              <button type="submit" className="btn btn-primary" disabled={sending}>
                {sending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </form>
        </article>

        <div className="contact-side-stack">
          <article className="card">
            <div className="badge card-badge">Live Support</div>
            <h2>Already a customer?</h2>
            <p>
              Sign in and start a live conversation with Centrum. Messages update in real time, and your chat stays tied to your account.
            </p>
            <div className="section-actions">
              <button type="button" className="btn btn-primary" onClick={startLiveChat}>Start Live Chat</button>
              <Link href="/portal/dashboard" className="btn btn-secondary">Customer Portal</Link>
            </div>
          </article>

          <article className="card">
            <div className="badge card-badge">Before You Contact Us</div>
            <h2>Help us solve it faster</h2>
            <ul className="simple-list contact-checklist">
              <li>For coverage checks, include your village and exact location.</li>
              <li>For technical issues, tell us which lights are showing on your router/ONT.</li>
              <li>For billing questions, include your customer name or payment reference.</li>
              <li>For existing support cases, use your ticket page so the full history stays together.</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
