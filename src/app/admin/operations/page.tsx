"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";

type Customer = { id: string; full_name: string | null; plan_id: number | null };
type Plan = { id: number; name: string; monthly_price_usd: number };
type Payment = { id: number; customer_id: string; amount_usd: number; paid_at: string; payment_method: string; reference: string | null; notes: string | null };
type Announcement = { id: number; title: string; body: string; is_published: boolean; starts_at: string; ends_at: string | null; created_at: string };
type ServiceRequest = { id: number; customer_id: string; request_type: string; details: string; status: string; admin_note: string | null; created_at: string };
type CustomizationRequest = { id: number; customer_id: string | null; full_name: string; email: string; phone: string | null; address: string | null; service_type: string; people_count: string | null; device_count: string | null; usage_types: string[]; budget_range: string | null; preferred_plan_name: string | null; current_provider: string | null; notes: string | null; status: "new" | "contacted" | "completed" | "closed"; email_sent_at: string | null; email_error: string | null; created_at: string };

const requestStatuses = ["submitted", "reviewing", "scheduled", "completed", "declined", "cancelled"];
const paymentMethods = ["cash", "bank_transfer", "card", "other"];

export default function AdminOperationsPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [customizationRequests, setCustomizationRequests] = useState<CustomizationRequest[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [paymentCustomerId, setPaymentCustomerId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [paymentSort, setPaymentSort] = useState("newest");
  const [paymentCustomerSearch, setPaymentCustomerSearch] = useState("");

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementPublished, setAnnouncementPublished] = useState(true);
  const [announcementEndsAt, setAnnouncementEndsAt] = useState("");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [announcementSearch, setAnnouncementSearch] = useState("");
  const [announcementFilter, setAnnouncementFilter] = useState("all");
  const [announcementSort, setAnnouncementSort] = useState("newest");

  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [requestSort, setRequestSort] = useState("newest");
  const [customizationSearch, setCustomizationSearch] = useState("");
  const [customizationStatusFilter, setCustomizationStatusFilter] = useState("all");
  const [customizationSort, setCustomizationSort] = useState("newest");
  const [savingCustomizationId, setSavingCustomizationId] = useState<number | null>(null);

  const [requestDrafts, setRequestDrafts] = useState<Record<number, { status: string; admin_note: string }>>({});
  const [savingRequestId, setSavingRequestId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!supabase) return;
    const [customersResult, plansResult, paymentsResult, announcementsResult, requestsResult, customizationResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,plan_id").order("full_name", { ascending: true }).limit(1000),
      supabase.from("plans").select("id,name,monthly_price_usd").order("monthly_price_usd", { ascending: true }),
      supabase.from("payments").select("id,customer_id,amount_usd,paid_at,payment_method,reference,notes").order("paid_at", { ascending: false }).limit(500),
      supabase.from("announcements").select("id,title,body,is_published,starts_at,ends_at,created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("service_requests").select("id,customer_id,request_type,details,status,admin_note,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("service_customization_requests").select("id,customer_id,full_name,email,phone,address,service_type,people_count,device_count,usage_types,budget_range,preferred_plan_name,current_provider,notes,status,email_sent_at,email_error,created_at").order("created_at", { ascending: false }).limit(300),
    ]);
    const firstError = customersResult.error || plansResult.error || paymentsResult.error || announcementsResult.error || requestsResult.error || customizationResult.error;
    if (firstError) setError(firstError.message);
    else setError("");
    setCustomers((customersResult.data as Customer[] | null) ?? []);
    setPlans((plansResult.data as Plan[] | null) ?? []);
    setPayments((paymentsResult.data as Payment[] | null) ?? []);
    setAnnouncements((announcementsResult.data as Announcement[] | null) ?? []);
    const nextRequests = (requestsResult.data as ServiceRequest[] | null) ?? [];
    setRequests(nextRequests);
    setCustomizationRequests((customizationResult.data as CustomizationRequest[] | null) ?? []);
    setRequestDrafts((current) => {
      const next = { ...current };
      for (const request of nextRequests) {
        if (!next[request.id]) next[request.id] = { status: request.status, admin_note: request.admin_note ?? "" };
      }
      return next;
    });
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
      const admin = await resolveIsAdmin(supabase!, data.user);
      if (!mounted) return;
      if (!admin) {
        router.replace("/portal/dashboard");
        return;
      }
      setAccount(data.user);
      await fetchAll();
      if (mounted) setLoading(false);
    }
    void boot();
    return () => { mounted = false; };
  }, [fetchAll, router, supabase]);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const paymentCustomerOptions = useMemo(() => {
    const query = paymentCustomerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const name = customer.full_name?.toLowerCase() ?? "";
      return name.includes(query) || customer.id.toLowerCase().includes(query);
    });
  }, [customers, paymentCustomerSearch]);

  const visiblePayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    const filtered = payments.filter((payment) => {
      if (paymentMethodFilter !== "all" && payment.payment_method !== paymentMethodFilter) return false;
      if (!query) return true;

      const customer = customerMap.get(payment.customer_id);
      const haystack = [
        customer?.full_name ?? "",
        payment.customer_id,
        payment.payment_method,
        payment.reference ?? "",
        payment.notes ?? "",
        String(payment.amount_usd),
      ].join(" ").toLowerCase();

      return haystack.includes(query);
    });

    return filtered.sort((a, b) => {
      if (paymentSort === "oldest") return new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime();
      if (paymentSort === "amount_high") return Number(b.amount_usd) - Number(a.amount_usd);
      if (paymentSort === "amount_low") return Number(a.amount_usd) - Number(b.amount_usd);
      if (paymentSort === "customer_az") {
        const aName = customerMap.get(a.customer_id)?.full_name ?? a.customer_id;
        const bName = customerMap.get(b.customer_id)?.full_name ?? b.customer_id;
        return aName.localeCompare(bName);
      }
      return new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime();
    });
  }, [customerMap, paymentMethodFilter, paymentSearch, paymentSort, payments]);

  const visibleAnnouncements = useMemo(() => {
    const query = announcementSearch.trim().toLowerCase();
    return [...announcements].filter((announcement) => {
      const matchesSearch = !query || `${announcement.title} ${announcement.body}`.toLowerCase().includes(query);
      const matchesFilter = announcementFilter === "all" || (announcementFilter === "published" ? announcement.is_published : !announcement.is_published);
      return matchesSearch && matchesFilter;
    }).sort((a, b) => announcementSort === "oldest" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [announcements, announcementSearch, announcementFilter, announcementSort]);

  const visibleRequests = useMemo(() => {
    const query = requestSearch.trim().toLowerCase();
    return [...requests].filter((request) => {
      const customer = customerMap.get(request.customer_id);
      const matchesSearch = !query || `${request.id} ${customer?.full_name ?? ""} ${request.request_type} ${request.details}`.toLowerCase().includes(query);
      return matchesSearch && (requestStatusFilter === "all" || request.status === requestStatusFilter);
    }).sort((a, b) => requestSort === "oldest" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [requests, requestSearch, requestStatusFilter, requestSort, customerMap]);

  const visibleCustomizationRequests = useMemo(() => {
    const query = customizationSearch.trim().toLowerCase();
    return [...customizationRequests].filter((request) => {
      const matchesSearch = !query || `${request.full_name} ${request.email} ${request.phone ?? ""} ${request.address ?? ""} ${request.preferred_plan_name ?? ""} ${request.usage_types.join(" ")}`.toLowerCase().includes(query);
      return matchesSearch && (customizationStatusFilter === "all" || request.status === customizationStatusFilter);
    }).sort((a, b) => customizationSort === "oldest" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [customizationRequests, customizationSearch, customizationStatusFilter, customizationSort]);

  function customerLabel(customerId: string) {
    const customer = customerMap.get(customerId);
    return customer?.full_name || `${customerId.slice(0, 8)}…`;
  }

  function chooseCustomer(customerId: string) {
    setPaymentCustomerId(customerId);
    const customer = customerMap.get(customerId);
    const assignedPlan = customer?.plan_id ? planMap.get(customer.plan_id) : null;
    if (assignedPlan) setPaymentAmount(String(assignedPlan.monthly_price_usd));
  }

  async function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !paymentCustomerId) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    setSavingPayment(true);
    setError("");
    setMessage("");
    const { error: insertError } = await supabase.from("payments").insert({
      customer_id: paymentCustomerId,
      amount_usd: amount,
      payment_method: paymentMethod,
      reference: paymentReference.trim() || null,
      notes: paymentNotes.trim() || null,
    });
    if (insertError) setError(insertError.message);
    else {
      setMessage("Payment recorded.");
      setPaymentReference("");
      setPaymentNotes("");
      await fetchAll();
    }
    setSavingPayment(false);
  }

  async function deletePayment(payment: Payment) {
    if (!supabase || !window.confirm(`Delete the $${Number(payment.amount_usd).toFixed(2)} payment record?`)) return;
    const { error: deleteError } = await supabase.from("payments").delete().eq("id", payment.id);
    if (deleteError) setError(deleteError.message);
    else await fetchAll();
  }

  async function addAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !announcementTitle.trim() || !announcementBody.trim()) return;
    setSavingAnnouncement(true);
    setError("");
    setMessage("");
    const { error: insertError } = await supabase.from("announcements").insert({
      title: announcementTitle.trim(),
      body: announcementBody.trim(),
      is_published: announcementPublished,
      ends_at: announcementEndsAt ? new Date(`${announcementEndsAt}T23:59:59`).toISOString() : null,
    });
    if (insertError) setError(insertError.message);
    else {
      setAnnouncementTitle("");
      setAnnouncementBody("");
      setAnnouncementEndsAt("");
      setAnnouncementPublished(true);
      setMessage("Announcement created.");
      await fetchAll();
    }
    setSavingAnnouncement(false);
  }

  async function toggleAnnouncement(announcement: Announcement) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("announcements").update({ is_published: !announcement.is_published }).eq("id", announcement.id);
    if (updateError) setError(updateError.message);
    else await fetchAll();
  }

  async function deleteAnnouncement(announcement: Announcement) {
    if (!supabase || !window.confirm(`Delete “${announcement.title}”?`)) return;
    const { error: deleteError } = await supabase.from("announcements").delete().eq("id", announcement.id);
    if (deleteError) setError(deleteError.message);
    else await fetchAll();
  }

  async function saveRequest(request: ServiceRequest) {
    if (!supabase) return;
    const draft = requestDrafts[request.id] ?? { status: request.status, admin_note: request.admin_note ?? "" };
    setSavingRequestId(request.id);
    setError("");
    const { error: updateError } = await supabase.from("service_requests").update({
      status: draft.status,
      admin_note: draft.admin_note.trim() || null,
    }).eq("id", request.id);
    if (updateError) setError(updateError.message);
    else {
      setMessage(`Service request #${request.id} updated.`);
      await fetchAll();
    }
    setSavingRequestId(null);
  }

  async function updateCustomizationStatus(request: CustomizationRequest, status: CustomizationRequest["status"]) {
    if (!supabase) return;
    setSavingCustomizationId(request.id);
    setError("");
    const { error: updateError } = await supabase.from("service_customization_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", request.id);
    if (updateError) setError(updateError.message);
    else await fetchAll();
    setSavingCustomizationId(null);
  }

  async function deleteCustomizationRequest(request: CustomizationRequest) {
    if (!supabase || !window.confirm(`Delete customization request #${request.id} from ${request.full_name}?`)) return;
    setSavingCustomizationId(request.id);
    const { error: deleteError } = await supabase.from("service_customization_requests").delete().eq("id", request.id);
    if (deleteError) setError(deleteError.message);
    else await fetchAll();
    setSavingCustomizationId(null);
  }

  if (loading) return <section><h1>Customer Operations</h1><p className="page-intro">Checking admin access...</p></section>;
  if (!supabase) return <section><h1>Customer Operations</h1><p className="page-intro">Supabase is not configured.</p></section>;
  if (!account) return <section><h1>Customer Operations</h1><p className="page-intro">Redirecting...</p></section>;

  return (
    <section className="animate-fade-in admin-page">
      <div className="admin-header">
        <div>
          <div className="badge badge-pulse page-badge">Centrum-owned Data</div>
          <h1>Customer Operations</h1>
          <p className="page-intro">Billing records, customer notices, and service requests — no ISP or RADIUS API required.</p>
        </div>
        <Link href="/admin" className="btn btn-secondary">Back to Admin</Link>
      </div>

      {error ? <p className="form-alert form-alert-error">{error}</p> : null}
      {message ? <p className="form-alert form-alert-success">{message}</p> : null}

      <article className="card admin-section">
        <div className="badge card-badge">Billing</div>
        <h2>Record a Payment</h2>
        <form className="form-grid" onSubmit={addPayment}>
          <div className="form-four-col">
            <label>Customer
              <input
                value={paymentCustomerSearch}
                onChange={(event) => setPaymentCustomerSearch(event.target.value)}
                placeholder="Search customer name or ID"
                aria-label="Search customers before recording a payment"
              />
              <select value={paymentCustomerId} onChange={(event) => chooseCustomer(event.target.value)} required>
                <option value="">Choose customer ({paymentCustomerOptions.length})</option>
                {paymentCustomerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.id.slice(0, 8)}</option>)}
              </select>
            </label>
            <label>Amount USD<input type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required /></label>
            <label>Method
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map((method) => <option key={method} value={method}>{formatStatus(method)}</option>)}</select>
            </label>
            <label>Reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Optional receipt/ref" /></label>
          </div>
          <label>Notes<textarea rows={3} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Optional internal note" /></label>
          <button type="submit" className="btn btn-primary" disabled={savingPayment}>{savingPayment ? "Saving..." : "Record Payment"}</button>
        </form>
        <div className="payment-history-heading">
          <div>
            <h3>Payment History</h3>
            <p>{visiblePayments.length} matching record{visiblePayments.length === 1 ? "" : "s"} · {payments.length} loaded</p>
          </div>
        </div>
        <div className="payment-filter-grid">
          <input
            className="admin-search"
            value={paymentSearch}
            onChange={(event) => setPaymentSearch(event.target.value)}
            placeholder="Search customer, reference, note, amount..."
            aria-label="Search payment history"
          />
          <select value={paymentMethodFilter} onChange={(event) => setPaymentMethodFilter(event.target.value)} aria-label="Filter payments by method">
            <option value="all">All methods</option>
            {paymentMethods.map((method) => <option key={method} value={method}>{formatStatus(method)}</option>)}
          </select>
          <select value={paymentSort} onChange={(event) => setPaymentSort(event.target.value)} aria-label="Sort payment history">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount_high">Amount: high to low</option>
            <option value="amount_low">Amount: low to high</option>
            <option value="customer_az">Customer: A–Z</option>
          </select>
        </div>
        <div className="plan-list payment-history-list fixed-scroll-list">
          {visiblePayments.length ? visiblePayments.map((payment) => (
            <div className="plan-row payment-history-row" key={payment.id}>
              <div className="plan-summary">
                <strong>{customerLabel(payment.customer_id)}</strong>
                <div className="plan-meta">
                  <span>${Number(payment.amount_usd).toFixed(2)}</span>
                  <span>{formatStatus(payment.payment_method)}</span>
                  <span>{formatDateTime(payment.paid_at)}</span>
                  {payment.reference ? <span>Ref: {payment.reference}</span> : null}
                  {payment.notes ? <span>Note: {payment.notes}</span> : null}
                </div>
              </div>
              <button className="btn btn-danger btn-compact" type="button" onClick={() => void deletePayment(payment)}>Delete</button>
            </div>
          )) : <p className="empty-state">No payment records match these filters.</p>}
        </div>
      </article>

      <article className="card admin-section">
        <div className="badge card-badge">Customer Notices</div>
        <h2>Announcements</h2>
        <form className="form-grid" onSubmit={addAnnouncement}>
          <label>Title<input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="e.g. Planned maintenance" required /></label>
          <label>Message<textarea rows={4} value={announcementBody} onChange={(event) => setAnnouncementBody(event.target.value)} placeholder="What customers need to know" required /></label>
          <div className="form-four-col">
            <label>End date<input type="date" value={announcementEndsAt} onChange={(event) => setAnnouncementEndsAt(event.target.value)} /></label>
            <label className="checkbox-label"><input type="checkbox" checked={announcementPublished} onChange={(event) => setAnnouncementPublished(event.target.checked)} /> Publish immediately</label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={savingAnnouncement}>{savingAnnouncement ? "Publishing..." : "Create Announcement"}</button>
        </form>
        <div className="list-toolbar list-toolbar-three">
          <input className="admin-search" value={announcementSearch} onChange={(event) => setAnnouncementSearch(event.target.value)} placeholder="Search announcements..." />
          <select value={announcementFilter} onChange={(event) => setAnnouncementFilter(event.target.value)}><option value="all">All notices</option><option value="published">Published</option><option value="hidden">Hidden</option></select>
          <select value={announcementSort} onChange={(event) => setAnnouncementSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>
        <div className="plan-list fixed-scroll-list">
          {visibleAnnouncements.map((announcement) => (
            <div className="plan-row" key={announcement.id}>
              <div className="plan-summary"><div className="plan-name-row"><strong>{announcement.title}</strong><span className={`status-pill ${announcement.is_published ? "status-active" : "status-inactive"}`}>{announcement.is_published ? "Published" : "Hidden"}</span></div><p>{announcement.body}</p><div className="plan-meta"><span>{formatDateTime(announcement.created_at)}</span>{announcement.ends_at ? <span>Ends {formatDateTime(announcement.ends_at)}</span> : null}</div></div>
              <div className="plan-actions"><button type="button" className="btn btn-secondary btn-compact" onClick={() => void toggleAnnouncement(announcement)}>{announcement.is_published ? "Hide" : "Publish"}</button><button type="button" className="btn btn-danger btn-compact" onClick={() => void deleteAnnouncement(announcement)}>Delete</button></div>
            </div>
          ))}
          {!visibleAnnouncements.length ? <p className="empty-state">No announcements match the current search or filters.</p> : null}
        </div>
      </article>

      <article className="card admin-section">
        <div className="badge card-badge">Service Desk</div>
        <h2>Customer Service Requests</h2>
        <p className="page-intro">Requests submitted from the customer dashboard appear here.</p>
        <div className="list-toolbar list-toolbar-three">
          <input className="admin-search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search customer, request type or details..." />
          <select value={requestStatusFilter} onChange={(event) => setRequestStatusFilter(event.target.value)}><option value="all">All request states</option>{requestStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select>
          <select value={requestSort} onChange={(event) => setRequestSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>
        <div className="request-admin-list fixed-scroll-list">
          {visibleRequests.length ? visibleRequests.map((request) => {
            const draft = requestDrafts[request.id] ?? { status: request.status, admin_note: request.admin_note ?? "" };
            return (
              <div className="request-admin-row" key={request.id}>
                <div className="request-admin-summary"><strong>#{request.id} · {customerLabel(request.customer_id)}</strong><span>{formatStatus(request.request_type)} · {formatDateTime(request.created_at)}</span><p>{request.details}</p></div>
                <div className="request-admin-controls">
                  <select value={draft.status} onChange={(event) => setRequestDrafts((current) => ({ ...current, [request.id]: { ...draft, status: event.target.value } }))}>{requestStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select>
                  <input value={draft.admin_note} onChange={(event) => setRequestDrafts((current) => ({ ...current, [request.id]: { ...draft, admin_note: event.target.value } }))} placeholder="Message visible to customer" />
                  <button type="button" className="btn btn-primary btn-compact" onClick={() => void saveRequest(request)} disabled={savingRequestId === request.id}>{savingRequestId === request.id ? "Saving..." : "Save"}</button>
                </div>
              </div>
            );
          }) : <p className="empty-state">No service requests match the current search or filters.</p>}
        </div>
      </article>

      <article className="card admin-section">
        <div className="badge card-badge">Service Match</div>
        <h2>Customization Requests</h2>
        <p className="page-intro">Optional plan/setup questionnaires from new and existing customers. Email delivery is tracked here too.</p>
        <div className="list-toolbar list-toolbar-three">
          <input className="admin-search" value={customizationSearch} onChange={(event) => setCustomizationSearch(event.target.value)} placeholder="Search name, email, address, plan or usage..." />
          <select value={customizationStatusFilter} onChange={(event) => setCustomizationStatusFilter(event.target.value)}><option value="all">All request states</option><option value="new">New</option><option value="contacted">Contacted</option><option value="completed">Completed</option><option value="closed">Closed</option></select>
          <select value={customizationSort} onChange={(event) => setCustomizationSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>
        <div className="customization-admin-list fixed-scroll-list">
          {visibleCustomizationRequests.length ? visibleCustomizationRequests.map((request) => (
            <article className="customization-admin-row" key={request.id}>
              <div className="customization-admin-heading">
                <div><strong>#{request.id} · {request.full_name}</strong><a href={`mailto:${request.email}`}>{request.email}</a></div>
                <span className={`status-pill status-${request.status}`}>{formatStatus(request.status)}</span>
              </div>
              <div className="customization-admin-grid">
                <span><strong>Phone</strong>{request.phone || "—"}</span><span><strong>Address</strong>{request.address || "—"}</span><span><strong>Type</strong>{formatStatus(request.service_type)}</span><span><strong>Users / devices</strong>{request.people_count || "—"} / {request.device_count || "—"}</span><span><strong>Usage</strong>{request.usage_types.join(", ") || "—"}</span><span><strong>Budget</strong>{request.budget_range || "—"}</span><span><strong>Preferred plan</strong>{request.preferred_plan_name || "Recommend one"}</span><span><strong>Submitted</strong>{formatDateTime(request.created_at)}</span>
              </div>
              {request.notes ? <p className="customization-admin-notes">{request.notes}</p> : null}
              {request.email_error && !request.email_sent_at ? <p className="form-alert form-alert-error">Email not sent: {request.email_error}</p> : <p className="field-note">Email: {request.email_sent_at ? "sent" : "not configured / pending"}</p>}
              <div className="plan-actions">
                <select value={request.status} onChange={(event) => void updateCustomizationStatus(request, event.target.value as CustomizationRequest["status"])} disabled={savingCustomizationId === request.id}><option value="new">New</option><option value="contacted">Contacted</option><option value="completed">Completed</option><option value="closed">Closed</option></select>
                <a href={`mailto:${request.email}?subject=${encodeURIComponent("Centrum Service recommendation")}`} className="btn btn-primary btn-compact">Email Customer</a>
                <button type="button" className="btn btn-danger btn-compact" onClick={() => void deleteCustomizationRequest(request)} disabled={savingCustomizationId === request.id}>Delete</button>
              </div>
            </article>
          )) : <p className="empty-state">No customization requests match the current search or filters.</p>}
        </div>
      </article>
    </section>
  );
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
