"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import { AsyncState } from "@/components/AsyncState";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import { locationMapUrl } from "@/components/LocationCapture";

type Customer = { id: string; full_name: string | null; plan_id: number | null };
type Plan = { id: number; name: string; monthly_price_usd: number };
type Payment = { id: number; customer_id: string | null; amount_usd: number; paid_at: string; payment_method: string; reference: string | null; notes: string | null };
type Announcement = { id: number; title: string; body: string; is_published: boolean; starts_at: string; ends_at: string | null; created_at: string };
type ServiceRequest = { id: number; customer_id: string; request_type: string; details: string; status: string; admin_note: string | null; created_at: string; location_latitude: number | null; location_longitude: number | null; location_accuracy_m: number | null; location_captured_at: string | null };
type CustomizationRequest = { id: number; customer_id: string | null; full_name: string; email: string; phone: string | null; address: string | null; service_type: string; people_count: string | null; device_count: string | null; usage_types: string[]; budget_range: string | null; preferred_plan_name: string | null; current_provider: string | null; notes: string | null; status: "new" | "contacted" | "completed" | "closed"; email_sent_at: string | null; email_error: string | null; created_at: string; location_latitude: number | null; location_longitude: number | null; location_accuracy_m: number | null; location_captured_at: string | null };
type CustomerLocation = { customer_id: string; latitude: number; longitude: number; accuracy_m: number | null; captured_at: string; updated_at: string };

const requestStatuses = ["submitted", "reviewing", "scheduled", "completed", "declined", "cancelled"];
const paymentMethods = ["cash", "bank_transfer", "card", "other"];

type OperationsWorkspace = "overview" | "payments" | "announcements" | "requests" | "customization";

export default function AdminOperationsPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [monthlyPaymentCount, setMonthlyPaymentCount] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [customizationRequests, setCustomizationRequests] = useState<CustomizationRequest[]>([]);
  const [customerLocations, setCustomerLocations] = useState<CustomerLocation[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeWorkspace, setActiveWorkspace] = useState<OperationsWorkspace>("overview");
  const [notificationHighlight, setNotificationHighlight] = useState("");

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
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const [customersResult, plansResult, paymentsResult, monthlyPaymentsResult, announcementsResult, requestsResult, customizationResult, customerLocationsResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,plan_id").eq("role", "customer").order("full_name", { ascending: true }).limit(1000),
      supabase.from("plans").select("id,name,monthly_price_usd").order("monthly_price_usd", { ascending: true }),
      supabase.from("payments").select("id,customer_id,amount_usd,paid_at,payment_method,reference,notes").order("paid_at", { ascending: false }).limit(500),
      supabase.from("payments").select("amount_usd,paid_at").gte("paid_at", monthStart).lt("paid_at", nextMonthStart).order("paid_at", { ascending: true }).limit(5000),
      supabase.from("announcements").select("id,title,body,is_published,starts_at,ends_at,created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("service_requests").select("id,customer_id,request_type,details,status,admin_note,created_at,location_latitude,location_longitude,location_accuracy_m,location_captured_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("service_customization_requests").select("id,customer_id,full_name,email,phone,address,service_type,people_count,device_count,usage_types,budget_range,preferred_plan_name,current_provider,notes,status,email_sent_at,email_error,created_at,location_latitude,location_longitude,location_accuracy_m,location_captured_at").order("created_at", { ascending: false }).limit(300),
      supabase.from("customer_locations").select("customer_id,latitude,longitude,accuracy_m,captured_at,updated_at").limit(1000),
    ]);
    const firstError = customersResult.error || plansResult.error || paymentsResult.error || monthlyPaymentsResult.error || announcementsResult.error || requestsResult.error || customizationResult.error || customerLocationsResult.error;
    if (firstError) { console.error("Admin operations data load failed", firstError); setError(toFriendlyErrorMessage(firstError, "Customer operations data could not be loaded right now.")); }
    else setError("");
    setCustomers((customersResult.data as Customer[] | null) ?? []);
    setPlans((plansResult.data as Plan[] | null) ?? []);
    setPayments((paymentsResult.data as Payment[] | null) ?? []);
    const monthRows = (monthlyPaymentsResult.data as Array<{ amount_usd: number; paid_at: string }> | null) ?? [];
    setMonthlyRevenue(monthRows.reduce((sum, payment) => sum + Number(payment.amount_usd || 0), 0));
    setMonthlyPaymentCount(monthRows.length);
    setAnnouncements((announcementsResult.data as Announcement[] | null) ?? []);
    const nextRequests = (requestsResult.data as ServiceRequest[] | null) ?? [];
    setRequests(nextRequests);
    setCustomizationRequests((customizationResult.data as CustomizationRequest[] | null) ?? []);
    setCustomerLocations((customerLocationsResult.data as CustomerLocation[] | null) ?? []);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedWorkspace = params.get("workspace");
    if (requestedWorkspace && ["overview", "payments", "announcements", "requests", "customization"].includes(requestedWorkspace)) {
      setActiveWorkspace(requestedWorkspace as OperationsWorkspace);
    }
    setNotificationHighlight(params.get("highlight") ?? "");
  }, []);

  useEffect(() => {
    if (!notificationHighlight) return;
    const targetId = activeWorkspace === "requests"
      ? `admin-service-request-${notificationHighlight}`
      : activeWorkspace === "customization"
        ? `admin-customization-request-${notificationHighlight}`
        : null;
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeWorkspace, customizationRequests, notificationHighlight, requests]);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const customerLocationMap = useMemo(() => new Map(customerLocations.map((location) => [location.customer_id, location])), [customerLocations]);

  const operationsSummary = useMemo(() => {
    const now = new Date();
    const publishedAnnouncements = announcements.filter((announcement) => announcement.is_published).length;
    const openRequests = requests.filter((request) => !["completed", "declined", "cancelled"].includes(request.status)).length;
    const pendingCustomizations = customizationRequests.filter((request) => request.status === "new" || request.status === "contacted").length;

    return {
      monthlyRevenue,
      monthlyPaymentCount,
      monthLabel: new Intl.DateTimeFormat("en", { month: "long" }).format(now),
      publishedAnnouncements,
      openRequests,
      pendingCustomizations,
    };
  }, [announcements, customizationRequests, monthlyPaymentCount, monthlyRevenue, requests]);

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

      const customer = payment.customer_id ? customerMap.get(payment.customer_id) : undefined;
      const haystack = [
        customer?.full_name ?? "",
        payment.customer_id ?? "",
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
        const aName = a.customer_id ? (customerMap.get(a.customer_id)?.full_name ?? a.customer_id) : "Deleted account";
        const bName = b.customer_id ? (customerMap.get(b.customer_id)?.full_name ?? b.customer_id) : "Deleted account";
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

  function customerLabel(customerId: string | null) {
    if (!customerId) return "Deleted account";
    const customer = customerMap.get(customerId);
    return customer?.full_name || `${customerId.slice(0, 8)}…`;
  }

  function chooseCustomer(customerId: string) {
    setPaymentCustomerId(customerId);
    const customer = customerMap.get(customerId);
    const assignedPlan = customer?.plan_id ? planMap.get(customer.plan_id) : null;
    if (assignedPlan) setPaymentAmount(String(assignedPlan.monthly_price_usd));
  }

  async function acknowledgeAdminNotification(sourceType: string, sourceId: number) {
    if (!supabase || !account) return;
    const { error: acknowledgementError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", account.id)
      .eq("source_type", sourceType)
      .eq("source_id", String(sourceId))
      .is("read_at", null);
    if (acknowledgementError && acknowledgementError.code !== "42P01") {
      console.error("Admin notification acknowledgement failed", acknowledgementError);
    }
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
    if (insertError) setError(toFriendlyErrorMessage(insertError, "The payment could not be recorded. Please try again."));
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
    if (deleteError) setError(toFriendlyErrorMessage(deleteError, "The payment could not be deleted. Please try again."));
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
    if (insertError) setError(toFriendlyErrorMessage(insertError, "The announcement could not be created. Please try again."));
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
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The announcement could not be changed. Please try again."));
    else await fetchAll();
  }

  async function deleteAnnouncement(announcement: Announcement) {
    if (!supabase || !window.confirm(`Delete “${announcement.title}”?`)) return;
    const { error: deleteError } = await supabase.from("announcements").delete().eq("id", announcement.id);
    if (deleteError) setError(toFriendlyErrorMessage(deleteError, "The announcement could not be deleted. Please try again."));
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
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The service request could not be updated. Please try again."));
    else {
      setMessage(`Service request #${request.id} updated.`);
      await acknowledgeAdminNotification("service_request", request.id);
      await fetchAll();
    }
    setSavingRequestId(null);
  }

  async function updateCustomizationStatus(request: CustomizationRequest, status: CustomizationRequest["status"]) {
    if (!supabase) return;
    setSavingCustomizationId(request.id);
    setError("");
    const { error: updateError } = await supabase.from("service_customization_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", request.id);
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The customization request could not be updated. Please try again."));
    else {
      await acknowledgeAdminNotification("service_customization_request", request.id);
      await fetchAll();
    }
    setSavingCustomizationId(null);
  }

  async function deleteCustomizationRequest(request: CustomizationRequest) {
    if (!supabase || !window.confirm(`Delete customization request #${request.id} from ${request.full_name}?`)) return;
    setSavingCustomizationId(request.id);
    const { error: deleteError } = await supabase.from("service_customization_requests").delete().eq("id", request.id);
    if (deleteError) setError(toFriendlyErrorMessage(deleteError, "The customization request could not be deleted. Please try again."));
    else {
      await acknowledgeAdminNotification("service_customization_request", request.id);
      await fetchAll();
    }
    setSavingCustomizationId(null);
  }

  if (loading) return <section className="admin-page"><AsyncState kind="loading" eyebrow="Customer Operations" title="Loading operations" message="Getting billing, announcements, requests, and customer records." /></section>;
  if (!supabase) return <section className="admin-page"><AsyncState kind="error" eyebrow="Customer Operations" title="Operations are temporarily unavailable" message="Centrum couldn't connect to the backend. Please try again shortly." /></section>;
  if (!account) return <section className="admin-page"><AsyncState kind="loading" eyebrow="Customer Operations" title="Redirecting" message="Checking your admin session." /></section>;

  return (
    <section className="animate-fade-in admin-page operations-page">
      <div className="admin-header operations-header">
        <div>
          <div className="badge badge-pulse page-badge">Customer Operations</div>
          <h1>Operations Center</h1>
          <p className="page-intro">Billing, notices, service requests, and plan recommendations — separated into focused workspaces.</p>
        </div>
        <div className="section-actions operations-header-actions">
          <Link href="/admin" className="btn btn-secondary">Back to Admin</Link>
        </div>
      </div>

      {message ? <p className="form-alert form-alert-success">{message}</p> : null}

      <div className="operations-console-shell">
        <aside className="operations-sidebar">
          <div className="admin-sidebar-section">
            <span className="admin-sidebar-eyebrow">Operations</span>
            <div className="admin-submenu">
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "overview" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("overview")}>
                <span><strong>Overview</strong><small>At a glance</small></span>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "payments" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("payments")}>
                <span><strong>Payments</strong><small>Billing records</small></span><b>{payments.length}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "announcements" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("announcements")}>
                <span><strong>Announcements</strong><small>Customer notices</small></span><b>{operationsSummary.publishedAnnouncements}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "requests" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("requests")}>
                <span><strong>Service Requests</strong><small>Customer requests</small></span><b>{operationsSummary.openRequests}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "customization" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("customization")}>
                <span><strong>Recommendations</strong><small>Plan matching</small></span><b>{operationsSummary.pendingCustomizations}</b>
              </button>
            </div>
          </div>

          <div className="admin-sidebar-section operations-sidebar-tools">
            <span className="admin-sidebar-eyebrow">Admin Tools</span>
            <Link href="/admin/live-chat" className="admin-tool-link">
              <span><strong>Live Chat Inbox</strong><small>Open conversations</small></span>
              <span>→</span>
            </Link>
            <Link href="/admin/revenue" className="admin-tool-link">
              <span><strong>Revenue & Collections</strong><small>Finance analytics</small></span>
              <span>→</span>
            </Link>
            <Link href="/admin" className="admin-tool-link">
              <span><strong>Admin Console</strong><small>Customers & network</small></span>
              <span>→</span>
            </Link>
          </div>
        </aside>

        <div className="operations-console-content">
          {error ? (
            <AsyncState kind="error" eyebrow="Operations Data" title="That operation needs another try" message={error} onRetry={() => void fetchAll()} retryLabel="Retry Operations Data" />
          ) : null}

          {activeWorkspace === "overview" ? (
            <div className="operations-overview">
              <div className="admin-workspace-heading">
                <div>
                  <div className="badge card-badge">Overview</div>
                  <h2>Customer Operations</h2>
                  <p className="page-intro">The things that need attention without every form and list competing for space.</p>
                </div>
              </div>

              <div className="operations-summary-grid">
                <Link href="/admin/revenue" className="admin-overview-card">
                  <span className="admin-overview-label">Monthly Revenue</span>
                  <strong>${operationsSummary.monthlyRevenue.toFixed(2)}</strong>
                  <small>{operationsSummary.monthlyPaymentCount} payment{operationsSummary.monthlyPaymentCount === 1 ? "" : "s"} collected in {operationsSummary.monthLabel}.</small>
                  <span className="admin-overview-action">Open revenue dashboard →</span>
                </Link>

                <button type="button" className="admin-overview-card" onClick={() => setActiveWorkspace("announcements")}>
                  <span className="admin-overview-label">Published Notices</span>
                  <strong>{operationsSummary.publishedAnnouncements}</strong>
                  <small>{announcements.length} announcement{announcements.length === 1 ? "" : "s"} loaded in total.</small>
                  <span className="admin-overview-action">Manage notices →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => setActiveWorkspace("requests")}>
                  <span className="admin-overview-label">Open Service Requests</span>
                  <strong>{operationsSummary.openRequests}</strong>
                  <small>{requests.length} customer service request{requests.length === 1 ? "" : "s"} loaded.</small>
                  <span className="admin-overview-action">Review requests →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => setActiveWorkspace("customization")}>
                  <span className="admin-overview-label">Plan Follow-ups</span>
                  <strong>{operationsSummary.pendingCustomizations}</strong>
                  <small>New or contacted recommendation requests still needing follow-up.</small>
                  <span className="admin-overview-action">Open recommendations →</span>
                </button>
              </div>

              <article className="card operations-overview-guide">
                <div>
                  <div className="badge card-badge">Workflow</div>
                  <h2>Keep each job in its own workspace</h2>
                </div>
                <div className="operations-overview-guide-grid">
                  <div><strong>Payments</strong><span>Record a payment and check billing history.</span></div>
                  <div><strong>Announcements</strong><span>Publish customer-facing notices without digging through billing data.</span></div>
                  <div><strong>Service Requests</strong><span>Review requests and update status or customer-visible notes.</span></div>
                  <div><strong>Recommendations</strong><span>Follow up on plan/customization questionnaires.</span></div>
                </div>
              </article>
            </div>
          ) : null}

          {activeWorkspace === "payments" ? (
            <div className="operations-workspace">
              <div className="admin-workspace-heading">
                <div>
                  <div className="badge card-badge">Billing Workspace</div>
                  <h2>Payments</h2>
                  <p className="page-intro">Record payments and search history without the other operations panels below it.</p>
                </div>
                <div className="revenue-workspace-actions">
                  <Link href="/admin/revenue" className="btn btn-secondary btn-compact">Revenue Dashboard</Link>
                  <span className="status-pill status-active">{payments.length} loaded</span>
                </div>
              </div>
      <article className="card admin-section">
        <div className="badge card-badge">Billing</div>
        <h2>Payments</h2>
        <p className="page-intro">Record customer payments and review billing history from one workspace.</p>
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
            </div>
          ) : null}

          {activeWorkspace === "announcements" ? (
            <div className="operations-workspace">
              <div className="admin-workspace-heading">
                <div>
                  <div className="badge card-badge">Customer Communications</div>
                  <h2>Announcements</h2>
                  <p className="page-intro">Create and manage customer-facing notices.</p>
                </div>
                <span className="status-pill status-active">{operationsSummary.publishedAnnouncements} published</span>
              </div>
      <article className="card admin-section">
        <div className="badge card-badge">Customer Notices</div>
        <h2>Announcements</h2>
        <p className="page-intro">Publish, hide, and manage messages shown to customers.</p>
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
            </div>
          ) : null}

          {activeWorkspace === "requests" ? (
            <div className="operations-workspace">
              <div className="admin-workspace-heading">
                <div>
                  <div className="badge card-badge">Service Desk</div>
                  <h2>Service Requests</h2>
                  <p className="page-intro">Work through customer requests and update their visible status.</p>
                </div>
                <span className="status-pill status-active">{operationsSummary.openRequests} open</span>
              </div>
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
            const attachedLocation = request.location_latitude !== null && request.location_longitude !== null
              ? { latitude: request.location_latitude, longitude: request.location_longitude }
              : null;
            const savedLocation = customerLocationMap.get(request.customer_id) ?? null;
            const effectiveLocation = attachedLocation ?? savedLocation;
            return (
              <div
                className={`request-admin-row ${notificationHighlight === String(request.id) ? "notification-highlight" : ""}`}
                id={`admin-service-request-${request.id}`}
                key={request.id}
              >
                <div className="request-admin-summary"><strong>#{request.id} · {customerLabel(request.customer_id)}</strong><span>{formatStatus(request.request_type)} · {formatDateTime(request.created_at)}</span><p>{request.details}</p>{effectiveLocation ? <a className="manager-location-link" href={locationMapUrl({ latitude: effectiveLocation.latitude, longitude: effectiveLocation.longitude })} target="_blank" rel="noreferrer">{attachedLocation ? "Open attached visit location ↗" : "Open saved customer location ↗"}</a> : null}</div>
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
            </div>
          ) : null}

          {activeWorkspace === "customization" ? (
            <div className="operations-workspace">
              <div className="admin-workspace-heading">
                <div>
                  <div className="badge card-badge">Service Match</div>
                  <h2>Plan Recommendations</h2>
                  <p className="page-intro">Handle recommendation questionnaires and follow-ups separately from normal service requests.</p>
                </div>
                <span className="status-pill status-active">{operationsSummary.pendingCustomizations} pending</span>
              </div>
      <article className="card admin-section">
        <div className="badge card-badge">Service Match</div>
        <h2>Plan Recommendations</h2>
        <p className="page-intro">Optional plan/setup questionnaires from new and existing customers. Email delivery is tracked here too.</p>
        <div className="list-toolbar list-toolbar-three">
          <input className="admin-search" value={customizationSearch} onChange={(event) => setCustomizationSearch(event.target.value)} placeholder="Search name, email, address, plan or usage..." />
          <select value={customizationStatusFilter} onChange={(event) => setCustomizationStatusFilter(event.target.value)}><option value="all">All request states</option><option value="new">New</option><option value="contacted">Contacted</option><option value="completed">Completed</option><option value="closed">Closed</option></select>
          <select value={customizationSort} onChange={(event) => setCustomizationSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>
        <div className="customization-admin-list fixed-scroll-list">
          {visibleCustomizationRequests.length ? visibleCustomizationRequests.map((request) => {
            const attachedLocation = request.location_latitude !== null && request.location_longitude !== null
              ? { latitude: request.location_latitude, longitude: request.location_longitude }
              : null;
            const savedLocation = request.customer_id ? (customerLocationMap.get(request.customer_id) ?? null) : null;
            const effectiveLocation = attachedLocation ?? savedLocation;
            return (
            <article
              className={`customization-admin-row ${notificationHighlight === String(request.id) ? "notification-highlight" : ""}`}
              id={`admin-customization-request-${request.id}`}
              key={request.id}
            >
              <div className="customization-admin-heading">
                <div><strong>#{request.id} · {request.full_name}</strong><a href={`mailto:${request.email}`}>{request.email}</a></div>
                <span className={`status-pill status-${request.status}`}>{formatStatus(request.status)}</span>
              </div>
              <div className="customization-admin-grid">
                <span><strong>Phone</strong>{request.phone || "—"}</span><span><strong>Address</strong>{request.address || "—"}</span><span><strong>Type</strong>{formatStatus(request.service_type)}</span><span><strong>Users / devices</strong>{request.people_count || "—"} / {request.device_count || "—"}</span><span><strong>Usage</strong>{request.usage_types.join(", ") || "—"}</span><span><strong>Budget</strong>{request.budget_range || "—"}</span><span><strong>Preferred plan</strong>{request.preferred_plan_name || "Recommend one"}</span><span><strong>Submitted</strong>{formatDateTime(request.created_at)}</span>
              </div>
              {effectiveLocation ? <a className="manager-location-link" href={locationMapUrl({ latitude: effectiveLocation.latitude, longitude: effectiveLocation.longitude })} target="_blank" rel="noreferrer">{attachedLocation ? "Open attached service location ↗" : "Open saved customer location ↗"}</a> : null}
              {request.notes ? <p className="customization-admin-notes">{request.notes}</p> : null}
              {request.email_error && !request.email_sent_at ? <p className="form-alert form-alert-error">Email not sent: {request.email_error}</p> : <p className="field-note">Email: {request.email_sent_at ? "sent" : "not configured / pending"}</p>}
              <div className="plan-actions">
                <select value={request.status} onChange={(event) => void updateCustomizationStatus(request, event.target.value as CustomizationRequest["status"])} disabled={savingCustomizationId === request.id}><option value="new">New</option><option value="contacted">Contacted</option><option value="completed">Completed</option><option value="closed">Closed</option></select>
                <a href={`mailto:${request.email}?subject=${encodeURIComponent("Centrum Service recommendation")}`} className="btn btn-primary btn-compact">Email Customer</a>
                <button type="button" className="btn btn-danger btn-compact" onClick={() => void deleteCustomizationRequest(request)} disabled={savingCustomizationId === request.id}>Delete</button>
              </div>
            </article>
            );
          }) : <p className="empty-state">No customization requests match the current search or filters.</p>}
        </div>
      </article>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
