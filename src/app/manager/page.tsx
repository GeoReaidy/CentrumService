"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AsyncState } from "@/components/AsyncState";
import { NotificationPreferencesCard } from "@/components/NotificationPreferencesCard";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveUserRole, type CentrumRole } from "@/lib/supabase-role";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";

type ManagerWorkspace = "overview" | "customers" | "support" | "requests" | "customization" | "billing" | "announcements" | "settings";

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  plan_id: number | null;
  service_status: string;
  activation_date: string | null;
  renewal_date: string | null;
  renewal_auto_advance: boolean;
  renewal_interval_value: number;
  renewal_interval_unit: "week" | "month" | "year";
};

type Plan = { id: number; name: string; monthly_price_usd: number; is_active: boolean };
type Ticket = { id: number; customer_id: string; subject: string; status: string; priority: string; created_at: string; updated_at: string };
type ServiceRequest = { id: number; customer_id: string; request_type: string; details: string; status: string; admin_note: string | null; created_at: string; updated_at: string };
type CustomizationRequest = { id: number; customer_id: string | null; full_name: string; email: string; phone: string | null; service_type: string; usage_types: string[]; budget_range: string | null; preferred_plan_name: string | null; notes: string | null; status: string; created_at: string };
type Payment = { id: number; customer_id: string | null; amount_usd: number; paid_at: string; payment_method: string; reference: string | null; notes: string | null };
type Announcement = { id: number; title: string; body: string; is_published: boolean; starts_at: string; ends_at: string | null; created_at: string };

type CustomerDraft = {
  full_name: string;
  phone: string;
  address: string;
  plan_id: string;
  service_status: string;
  activation_date: string;
  renewal_date: string;
  renewal_auto_advance: boolean;
  renewal_interval_value: string;
  renewal_interval_unit: "week" | "month" | "year";
};

const requestStatuses = ["submitted", "reviewing", "scheduled", "completed", "declined", "cancelled"];
const customizationStatuses = ["new", "contacted", "completed", "closed"];

export default function ManagerPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [role, setRole] = useState<CentrumRole>("customer");
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [workspace, setWorkspace] = useState<ManagerWorkspace>("overview");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [customizations, setCustomizations] = useState<CustomizationRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDrafts, setCustomerDrafts] = useState<Record<string, CustomerDraft>>({});
  const [savingCustomerId, setSavingCustomerId] = useState<string | null>(null);
  const [ticketSearch, setTicketSearch] = useState("");
  const [requestNotes, setRequestNotes] = useState<Record<number, string>>({});
  const [savingRequestId, setSavingRequestId] = useState<number | null>(null);
  const [savingCustomizationId, setSavingCustomizationId] = useState<number | null>(null);

  const [paymentCustomerId, setPaymentCustomerId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("workspace");
    const allowed: ManagerWorkspace[] = ["overview", "customers", "support", "requests", "customization", "billing", "announcements", "settings"];
    if (requested && allowed.includes(requested as ManagerWorkspace)) setWorkspace(requested as ManagerWorkspace);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!supabase) return;

    const [customersResult, plansResult, ticketsResult, requestsResult, customizationsResult, paymentsResult, announcementsResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,phone,address,plan_id,service_status,activation_date,renewal_date,renewal_auto_advance,renewal_interval_value,renewal_interval_unit").eq("role", "customer").order("full_name", { ascending: true }).limit(1000),
      supabase.from("plans").select("id,name,monthly_price_usd,is_active").eq("is_active", true).order("monthly_price_usd", { ascending: true }),
      supabase.from("tickets").select("id,customer_id,subject,status,priority,created_at,updated_at").order("updated_at", { ascending: false }).limit(250),
      supabase.from("service_requests").select("id,customer_id,request_type,details,status,admin_note,created_at,updated_at").order("created_at", { ascending: false }).limit(250),
      supabase.from("service_customization_requests").select("id,customer_id,full_name,email,phone,service_type,usage_types,budget_range,preferred_plan_name,notes,status,created_at").order("created_at", { ascending: false }).limit(250),
      supabase.from("payments").select("id,customer_id,amount_usd,paid_at,payment_method,reference,notes").order("paid_at", { ascending: false }).limit(250),
      supabase.from("announcements").select("id,title,body,is_published,starts_at,ends_at,created_at").order("created_at", { ascending: false }).limit(100),
    ]);

    const firstError = customersResult.error || plansResult.error || ticketsResult.error || requestsResult.error || customizationsResult.error || paymentsResult.error || announcementsResult.error;
    if (firstError) {
      console.error("Manager console load failed", firstError);
      setError(toFriendlyErrorMessage(firstError, "Some manager data could not be loaded right now."));
    } else {
      setError("");
    }

    setCustomers((customersResult.data as Customer[] | null) ?? []);
    setPlans((plansResult.data as Plan[] | null) ?? []);
    setTickets((ticketsResult.data as Ticket[] | null) ?? []);
    setRequests((requestsResult.data as ServiceRequest[] | null) ?? []);
    setCustomizations((customizationsResult.data as CustomizationRequest[] | null) ?? []);
    setPayments((paymentsResult.data as Payment[] | null) ?? []);
    setAnnouncements((announcementsResult.data as Announcement[] | null) ?? []);
    setRequestNotes(Object.fromEntries(((requestsResult.data as ServiceRequest[] | null) ?? []).map((item) => [item.id, item.admin_note ?? ""])));
  }, [supabase]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;

    async function boot() {
      const { data, error: authError } = await supabase!.auth.getUser();
      if (!mounted) return;
      if (authError || !data.user) { setLoading(false); router.replace("/portal/login"); return; }

      const resolvedRole = await resolveUserRole(supabase!, data.user);
      if (!mounted) return;
      if (resolvedRole !== "manager" && resolvedRole !== "admin") {
        setLoading(false);
        router.replace("/portal/dashboard");
        return;
      }

      setAccount(data.user);
      setRole(resolvedRole);
      await fetchAll();
      if (mounted) setLoading(false);
    }

    void boot();
    return () => { mounted = false; };
  }, [fetchAll, router, supabase]);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => `${customer.full_name ?? ""} ${customer.phone ?? ""} ${customer.address ?? ""}`.toLowerCase().includes(query));
  }, [customerSearch, customers]);
  const filteredTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase();
    if (!query) return tickets;
    return tickets.filter((ticket) => `${ticket.id} ${ticket.subject} ${customerMap.get(ticket.customer_id)?.full_name ?? ""}`.toLowerCase().includes(query));
  }, [customerMap, ticketSearch, tickets]);

  const openTicketCount = tickets.filter((ticket) => ticket.status !== "resolved").length;
  const openRequestCount = requests.filter((request) => !["completed", "declined", "cancelled"].includes(request.status)).length;
  const pendingCustomizationCount = customizations.filter((request) => ["new", "contacted"].includes(request.status)).length;
  const publishedAnnouncementCount = announcements.filter((item) => item.is_published).length;

  function draftFor(customer: Customer): CustomerDraft {
    return customerDrafts[customer.id] ?? {
      full_name: customer.full_name ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      plan_id: customer.plan_id ? String(customer.plan_id) : "",
      service_status: customer.service_status,
      activation_date: customer.activation_date ?? "",
      renewal_date: customer.renewal_date ?? "",
      renewal_auto_advance: customer.renewal_auto_advance,
      renewal_interval_value: String(customer.renewal_interval_value ?? 1),
      renewal_interval_unit: customer.renewal_interval_unit ?? "month",
    };
  }

  function updateCustomerDraft(customer: Customer, patch: Partial<CustomerDraft>) {
    setCustomerDrafts((current) => ({ ...current, [customer.id]: { ...draftFor(customer), ...patch } }));
  }

  async function saveCustomer(customer: Customer) {
    if (!supabase) return;
    const draft = draftFor(customer);
    setSavingCustomerId(customer.id);
    setError(""); setMessage("");

    const { error: updateError } = await supabase.from("profiles").update({
      full_name: draft.full_name.trim() || customer.full_name,
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      plan_id: draft.plan_id ? Number(draft.plan_id) : null,
      service_status: draft.service_status,
      activation_date: draft.activation_date || null,
      renewal_date: draft.renewal_date || null,
      renewal_auto_advance: draft.renewal_auto_advance,
      renewal_interval_value: Math.max(1, Number(draft.renewal_interval_value) || 1),
      renewal_interval_unit: draft.renewal_interval_unit,
    }).eq("id", customer.id).eq("role", "customer");

    if (updateError) setError(toFriendlyErrorMessage(updateError, "The customer could not be updated."));
    else { setMessage(`${draft.full_name || "Customer"} updated.`); setSelectedCustomerId(null); await fetchAll(); }
    setSavingCustomerId(null);
  }

  async function updateServiceRequest(request: ServiceRequest, status: string) {
    if (!supabase) return;
    setSavingRequestId(request.id); setError(""); setMessage("");
    const { error: updateError } = await supabase.from("service_requests").update({ status, admin_note: requestNotes[request.id]?.trim() || null }).eq("id", request.id);
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The service request could not be updated."));
    else { setMessage(`Request #${request.id} updated.`); await fetchAll(); }
    setSavingRequestId(null);
  }

  async function updateCustomization(request: CustomizationRequest, status: string) {
    if (!supabase) return;
    setSavingCustomizationId(request.id); setError(""); setMessage("");
    const { error: updateError } = await supabase.from("service_customization_requests").update({ status }).eq("id", request.id);
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The customization request could not be updated."));
    else { setMessage(`Customization request #${request.id} updated.`); await fetchAll(); }
    setSavingCustomizationId(null);
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !paymentCustomerId || !paymentAmount) return;
    setSavingPayment(true); setError(""); setMessage("");
    const { error: insertError } = await supabase.from("payments").insert({
      customer_id: paymentCustomerId,
      amount_usd: Number(paymentAmount),
      payment_method: paymentMethod,
      reference: paymentReference.trim() || null,
      notes: paymentNotes.trim() || null,
    });
    if (insertError) setError(toFriendlyErrorMessage(insertError, "The payment could not be recorded."));
    else {
      setMessage("Payment recorded."); setPaymentAmount(""); setPaymentReference(""); setPaymentNotes("");
      await fetchAll();
    }
    setSavingPayment(false);
  }

  async function publishAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !announcementTitle.trim() || !announcementBody.trim()) return;
    setSavingAnnouncement(true); setError(""); setMessage("");
    const { error: insertError } = await supabase.from("announcements").insert({
      title: announcementTitle.trim(), body: announcementBody.trim(), is_published: true,
    });
    if (insertError) setError(toFriendlyErrorMessage(insertError, "The announcement could not be published."));
    else { setMessage("Announcement published."); setAnnouncementTitle(""); setAnnouncementBody(""); await fetchAll(); }
    setSavingAnnouncement(false);
  }

  async function toggleAnnouncement(item: Announcement) {
    if (!supabase) return;
    setError(""); setMessage("");
    const { error: updateError } = await supabase.from("announcements").update({ is_published: !item.is_published }).eq("id", item.id);
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The announcement could not be updated."));
    else { setMessage(item.is_published ? "Announcement hidden." : "Announcement published."); await fetchAll(); }
  }

  async function signOut() {
    if (!supabase || signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/portal/login");
    router.refresh();
  }

  if (loading) return <section className="manager-page"><AsyncState kind="loading" eyebrow="Manager Access" title="Opening manager console" message="Checking your role and loading customer operations." /></section>;
  if (!supabase) return <section className="manager-page"><AsyncState kind="error" eyebrow="Manager Console" title="Manager services are unavailable" message="Centrum could not connect to the account service." /></section>;
  if (!account) return null;

  const nav: Array<[ManagerWorkspace, string, string, number | null]> = [
    ["overview", "Overview", "Daily operations", null],
    ["customers", "Customers", "Subscriber accounts", customers.length],
    ["support", "Support", "Tickets & live chat", openTicketCount],
    ["requests", "Service Requests", "Technician & changes", openRequestCount],
    ["customization", "Recommendations", "Plan matching", pendingCustomizationCount],
    ["billing", "Billing", "Record payments", payments.length],
    ["announcements", "Announcements", "Customer notices", publishedAnnouncementCount],
    ["settings", "Settings", "Notifications & session", null],
  ];

  return (
    <section className="animate-fade-in manager-page">
      <div className="admin-header admin-console-header manager-console-header">
        <div>
          <div className="badge badge-pulse page-badge">{role === "admin" ? "Admin Preview · Manager" : "Privileged Access · Manager"}</div>
          <h1>Centrum Manager Console</h1>
          <p className="page-intro">Day-to-day customer operations without access to staff roles, monitoring credentials, destructive network controls, backups, or security settings.</p>
        </div>
        <div className="admin-header-utilities">
          {role === "admin" ? <Link href="/admin" className="btn btn-primary">Admin Console</Link> : null}
          <Link href="/" className="btn btn-secondary">Homepage</Link>
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing Out..." : "Sign Out"}</button>
        </div>
      </div>

      {error ? <p className="form-alert form-alert-error manager-global-alert">{error}</p> : null}
      {message ? <p className="form-alert form-alert-success manager-global-alert">{message}</p> : null}

      <div className="mobile-console-navigation" aria-label="Manager mobile navigation">
        <label className="mobile-console-workspace">
          <span>Workspace</span>
          <select
            value={workspace}
            onChange={(event) => setWorkspace(event.target.value as ManagerWorkspace)}
            aria-label="Choose manager workspace"
          >
            {nav.map(([key, label, , count]) => (
              <option key={key} value={key}>{count !== null ? `${label} (${count})` : label}</option>
            ))}
          </select>
        </label>

        <details className="mobile-console-tools">
          <summary>Tools</summary>
          <div className="mobile-console-tools-menu">
            <Link href="/manager/live-chat" className="mobile-console-tool-link"><strong>Live Chat Inbox</strong><small>Realtime customer chats</small></Link>
            {role === "admin" ? <Link href="/admin" className="mobile-console-tool-link"><strong>Admin Console</strong><small>Return to full administration</small></Link> : null}
            <Link href="/" className="mobile-console-tool-link"><strong>Homepage</strong><small>Open the public site</small></Link>
            <button type="button" className="mobile-console-tool-link mobile-console-signout" onClick={() => void signOut()} disabled={signingOut}>
              <strong>{signingOut ? "Signing Out..." : "Sign Out"}</strong><small>End this manager session</small>
            </button>
          </div>
        </details>
      </div>

      <div className="admin-console-shell manager-console-shell">
        <aside className="admin-console-sidebar" aria-label="Manager workspaces">
          <div className="admin-sidebar-section">
            <span className="admin-sidebar-eyebrow">Operations</span>
            <nav className="admin-submenu" aria-label="Manager sections">
              {nav.map(([key, label, detail, count]) => (
                <button type="button" key={key} className={`admin-submenu-item ${workspace === key ? "is-active" : ""}`} onClick={() => setWorkspace(key)} aria-pressed={workspace === key}>
                  <span><strong>{label}</strong><small>{detail}</small></span>{count !== null ? <b>{count}</b> : null}
                </button>
              ))}
            </nav>
          </div>
          <div className="admin-sidebar-section admin-sidebar-tools">
            <span className="admin-sidebar-eyebrow">Quick Tools</span>
            <Link href="/manager/live-chat" className="admin-tool-link"><span><strong>Live Chat Inbox</strong><small>Realtime customer chats</small></span><span>→</span></Link>
            <Link href="/portal" className="admin-tool-link"><span><strong>Role Home</strong><small>Reload role routing</small></span><span>→</span></Link>
          </div>
        </aside>

        <div className="admin-console-content manager-console-content">
          {workspace === "overview" ? (
            <div className="manager-workspace">
              <div className="admin-workspace-heading"><div><div className="badge card-badge">Today</div><h2>Operations overview</h2><p className="page-intro">The queues a manager should keep moving.</p></div></div>
              <div className="admin-overview-grid manager-overview-grid">
                <button type="button" className="admin-overview-card" onClick={() => setWorkspace("customers")}><span className="admin-overview-label">Customers</span><strong>{customers.length}</strong><small>Customer accounts available to manage.</small><span className="admin-overview-action">Open customers →</span></button>
                <button type="button" className="admin-overview-card" onClick={() => setWorkspace("support")}><span className="admin-overview-label">Open tickets</span><strong>{openTicketCount}</strong><small>Support tickets still needing attention.</small><span className="admin-overview-action">Open support →</span></button>
                <button type="button" className="admin-overview-card" onClick={() => setWorkspace("requests")}><span className="admin-overview-label">Service requests</span><strong>{openRequestCount}</strong><small>Visits and service changes still active.</small><span className="admin-overview-action">Review requests →</span></button>
                <button type="button" className="admin-overview-card" onClick={() => setWorkspace("customization")}><span className="admin-overview-label">Recommendations</span><strong>{pendingCustomizationCount}</strong><small>Customers waiting for plan follow-up.</small><span className="admin-overview-action">Review matches →</span></button>
                <button type="button" className="admin-overview-card" onClick={() => setWorkspace("billing")}><span className="admin-overview-label">Recent payments</span><strong>{payments.length}</strong><small>Payment records loaded into this view.</small><span className="admin-overview-action">Open billing →</span></button>
                <button type="button" className="admin-overview-card" onClick={() => setWorkspace("announcements")}><span className="admin-overview-label">Published notices</span><strong>{publishedAnnouncementCount}</strong><small>Customer announcements currently published.</small><span className="admin-overview-action">Manage notices →</span></button>
              </div>
              <article className="card manager-boundaries-card"><div className="badge card-badge">Access Boundary</div><h2>Manager privileges stop at operations</h2><p>Monitoring agents, router setup credentials, node deletion, service-catalog deletion, staff roles, backups, and security administration stay in the Admin Console.</p></article>
            </div>
          ) : null}

          {workspace === "customers" ? (
            <div className="manager-workspace">
              <div className="admin-workspace-heading"><div><div className="badge card-badge">Subscribers</div><h2>Customers</h2><p className="page-intro">Update customer contact, plan, service and renewal details. Staff roles are not exposed here.</p></div></div>
              <input className="admin-search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search name, phone or address..." />
              <div className="customer-list admin-scroll-list manager-customer-list">
                {filteredCustomers.map((customer) => {
                  const draft = draftFor(customer); const open = selectedCustomerId === customer.id;
                  return <div className={`customer-row ${open ? "customer-row-open" : ""}`} key={customer.id}>
                    <div className="customer-summary"><div><strong>{customer.full_name || "Unnamed customer"}</strong><span className="customer-id">{customer.id.slice(0, 8)}…</span></div><div className="customer-details"><span>{customer.phone || "No phone"}</span><span>{planMap.get(customer.plan_id ?? -1)?.name || "No active plan"}</span><span className={`status-pill status-${customer.service_status}`}>{formatStatus(customer.service_status)}</span><span>{customer.renewal_date ? `Renews ${customer.renewal_date}` : "No renewal date"}</span></div><button className="btn btn-secondary btn-compact" type="button" onClick={() => setSelectedCustomerId(open ? null : customer.id)}>{open ? "Close" : "Manage"}</button></div>
                    {open ? <div className="customer-editor manager-customer-editor">
                      <label>Full name<input value={draft.full_name} onChange={(event) => updateCustomerDraft(customer, { full_name: event.target.value })} /></label>
                      <label>Phone<input value={draft.phone} onChange={(event) => updateCustomerDraft(customer, { phone: event.target.value })} /></label>
                      <label>Address<input value={draft.address} onChange={(event) => updateCustomerDraft(customer, { address: event.target.value })} /></label>
                      <label>Plan<select value={draft.plan_id} onChange={(event) => updateCustomerDraft(customer, { plan_id: event.target.value })}><option value="">No plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ${plan.monthly_price_usd}/mo</option>)}</select></label>
                      <label>Service status<select value={draft.service_status} onChange={(event) => updateCustomerDraft(customer, { service_status: event.target.value })}><option value="active">Active</option><option value="pending_installation">Pending installation</option><option value="suspended">Suspended</option><option value="maintenance">Maintenance</option></select></label>
                      <label>Activation date<input type="date" value={draft.activation_date} onChange={(event) => updateCustomerDraft(customer, { activation_date: event.target.value })} /></label>
                      <label>Next renewal<input type="date" value={draft.renewal_date} onChange={(event) => updateCustomerDraft(customer, { renewal_date: event.target.value })} /></label>
                      <label>Renewal behavior<select value={draft.renewal_auto_advance ? "auto" : "manual"} onChange={(event) => updateCustomerDraft(customer, { renewal_auto_advance: event.target.value === "auto" })}><option value="manual">Manual date</option><option value="auto">Auto-advance after payment</option></select></label>
                      {draft.renewal_auto_advance ? <><label>Renew every<input type="number" min="1" max="52" value={draft.renewal_interval_value} onChange={(event) => updateCustomerDraft(customer, { renewal_interval_value: event.target.value })} /></label><label>Interval<select value={draft.renewal_interval_unit} onChange={(event) => updateCustomerDraft(customer, { renewal_interval_unit: event.target.value as CustomerDraft["renewal_interval_unit"] })}><option value="week">Week(s)</option><option value="month">Month(s)</option><option value="year">Year(s)</option></select></label></> : null}
                      <div className="customer-editor-actions"><button type="button" className="btn btn-primary" disabled={savingCustomerId === customer.id} onClick={() => void saveCustomer(customer)}>{savingCustomerId === customer.id ? "Saving..." : "Save Customer"}</button><button type="button" className="btn btn-secondary" onClick={() => setSelectedCustomerId(null)}>Cancel</button></div>
                    </div> : null}
                  </div>;
                })}
                {!filteredCustomers.length ? <p className="empty-state">No customers match your search.</p> : null}
              </div>
            </div>
          ) : null}

          {workspace === "support" ? (
            <div className="manager-workspace"><div className="admin-workspace-heading"><div><div className="badge card-badge">Support</div><h2>Tickets & live chat</h2><p className="page-intro">Open a ticket to reply and change its status, or jump into realtime chat.</p></div><Link href="/manager/live-chat" className="btn btn-primary">Open Live Chat</Link></div>
              <input className="admin-search" value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} placeholder="Search ticket, subject or customer..." />
              <div className="manager-ticket-list admin-scroll-list">{filteredTickets.map((ticket) => <Link href={`/portal/tickets/${ticket.id}`} className="manager-ticket-row" key={ticket.id}><div><strong>#{ticket.id} · {ticket.subject}</strong><span>{customerMap.get(ticket.customer_id)?.full_name || "Customer"} · {formatDateTime(ticket.created_at)}</span></div><span className={`status-pill status-${ticket.status}`}>{formatStatus(ticket.status)}</span></Link>)}{!filteredTickets.length ? <p className="empty-state">No tickets match your search.</p> : null}</div>
            </div>
          ) : null}

          {workspace === "requests" ? (
            <div className="manager-workspace"><div className="admin-workspace-heading"><div><div className="badge card-badge">Field & Service</div><h2>Service requests</h2><p className="page-intro">Handle technical visits, plan changes, relocations and equipment requests.</p></div></div>
              <div className="manager-request-list">{requests.map((request) => <article className="card manager-request-card" key={request.id}><div className="manager-row-heading"><div><strong>#{request.id} · {formatStatus(request.request_type)}</strong><span>{customerMap.get(request.customer_id)?.full_name || "Customer"} · {formatDateTime(request.created_at)}</span></div><span className={`status-pill status-${request.status}`}>{formatStatus(request.status)}</span></div><p>{request.details}</p><label>Customer-visible note<input value={requestNotes[request.id] ?? ""} onChange={(event) => setRequestNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Appointment time, follow-up note..." /></label><div className="section-actions"><select defaultValue={request.status} id={`request-status-${request.id}`}>{requestStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select><button type="button" className="btn btn-primary btn-compact" disabled={savingRequestId === request.id} onClick={() => { const el = document.getElementById(`request-status-${request.id}`) as HTMLSelectElement | null; void updateServiceRequest(request, el?.value ?? request.status); }}>{savingRequestId === request.id ? "Saving..." : "Save Update"}</button></div></article>)}{!requests.length ? <p className="empty-state">No service requests yet.</p> : null}</div>
            </div>
          ) : null}

          {workspace === "customization" ? (
            <div className="manager-workspace"><div className="admin-workspace-heading"><div><div className="badge card-badge">Service Match</div><h2>Customization requests</h2><p className="page-intro">Follow up with customers asking Centrum to recommend the right service setup.</p></div></div>
              <div className="manager-request-list">{customizations.map((request) => <article className="card manager-request-card" key={request.id}><div className="manager-row-heading"><div><strong>#{request.id} · {request.full_name}</strong><span><a href={`mailto:${request.email}`}>{request.email}</a>{request.phone ? ` · ${request.phone}` : ""}</span></div><span className={`status-pill status-${request.status}`}>{formatStatus(request.status)}</span></div><div className="manager-request-facts"><span><strong>Type</strong>{formatStatus(request.service_type)}</span><span><strong>Usage</strong>{request.usage_types.join(", ") || "—"}</span><span><strong>Budget</strong>{request.budget_range || "—"}</span><span><strong>Preferred</strong>{request.preferred_plan_name || "Recommend a plan"}</span></div>{request.notes ? <p>{request.notes}</p> : null}<div className="section-actions"><select value={request.status} onChange={(event) => void updateCustomization(request, event.target.value)} disabled={savingCustomizationId === request.id}>{customizationStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select><a className="btn btn-primary btn-compact" href={`mailto:${request.email}?subject=${encodeURIComponent("Centrum Service recommendation")}`}>Email Customer</a></div></article>)}{!customizations.length ? <p className="empty-state">No customization requests yet.</p> : null}</div>
            </div>
          ) : null}

          {workspace === "billing" ? (
            <div className="manager-workspace"><div className="admin-workspace-heading"><div><div className="badge card-badge">Billing</div><h2>Record payments</h2><p className="page-intro">Managers can add payment records and review history. Editing or deleting historical payments remains admin-only.</p></div></div>
              <article className="card"><form className="form-grid" onSubmit={recordPayment}><label>Customer<select value={paymentCustomerId} onChange={(event) => setPaymentCustomerId(event.target.value)} required><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.id.slice(0, 8)}</option>)}</select></label><div className="form-two-col"><label>Amount USD<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required /></label><label>Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="whish">Whish / transfer</option><option value="other">Other</option></select></label></div><label>Reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Optional receipt / reference" /></label><label>Notes<textarea rows={3} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} /></label><button className="btn btn-primary" type="submit" disabled={savingPayment}>{savingPayment ? "Recording..." : "Record Payment"}</button></form></article>
              <div className="manager-payment-list admin-scroll-list">{payments.map((payment) => <div className="manager-payment-row" key={payment.id}><div><strong>${Number(payment.amount_usd).toFixed(2)} · {customerMap.get(payment.customer_id ?? "")?.full_name || "Deleted / unknown account"}</strong><span>{formatStatus(payment.payment_method)} · {formatDateTime(payment.paid_at)}{payment.reference ? ` · ${payment.reference}` : ""}</span></div></div>)}{!payments.length ? <p className="empty-state">No payment records loaded.</p> : null}</div>
            </div>
          ) : null}

          {workspace === "announcements" ? (
            <div className="manager-workspace"><div className="admin-workspace-heading"><div><div className="badge card-badge">Notices</div><h2>Announcements</h2><p className="page-intro">Publish and unpublish customer notices. Permanent deletion stays admin-only.</p></div></div>
              <article className="card"><form className="form-grid" onSubmit={publishAnnouncement}><label>Title<input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} required /></label><label>Message<textarea rows={4} value={announcementBody} onChange={(event) => setAnnouncementBody(event.target.value)} required /></label><button className="btn btn-primary" type="submit" disabled={savingAnnouncement}>{savingAnnouncement ? "Publishing..." : "Publish Announcement"}</button></form></article>
              <div className="manager-announcement-list">{announcements.map((item) => <article className="card manager-announcement-row" key={item.id}><div className="manager-row-heading"><div><strong>{item.title}</strong><span>{formatDateTime(item.created_at)}</span></div><span className={`status-pill ${item.is_published ? "status-active" : "status-inactive"}`}>{item.is_published ? "Published" : "Hidden"}</span></div><p>{item.body}</p><button type="button" className="btn btn-secondary btn-compact" onClick={() => void toggleAnnouncement(item)}>{item.is_published ? "Unpublish" : "Publish"}</button></article>)}{!announcements.length ? <p className="empty-state">No announcements yet.</p> : null}</div>
            </div>
          ) : null}

          {workspace === "settings" ? (
            <div className="manager-workspace"><div className="admin-workspace-heading"><div><div className="badge card-badge">Manager Settings</div><h2>Notifications & session</h2><p className="page-intro">Personal settings only. Staff roles and system security remain admin-only.</p></div></div>
              <NotificationPreferencesCard userId={account.id} isAdmin />
              <article className="card manager-session-card"><div><div className="badge card-badge">Session</div><h2>{account.email ?? "Manager account"}</h2><p className="page-intro">Signed in with the Manager role.</p></div><button type="button" className="btn btn-secondary" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing Out..." : "Sign Out"}</button></article>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatStatus(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
