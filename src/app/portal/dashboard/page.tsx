'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import { deriveCustomerNodeState, type ProbeStatus } from "@/lib/network-monitoring";
import { ServiceCustomizationWizard } from "@/components/ServiceCustomizationWizard";

const statusLabelMap = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
} as const;

const requestTypeLabels = {
  plan_change: "Change plan",
  technical_visit: "Technical visit",
  router_replacement: "Router / ONT replacement",
  relocation: "Move service",
  temporary_suspension: "Temporary suspension",
  other: "Other request",
} as const;

const requestStatusLabels: Record<string, string> = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  scheduled: "Scheduled",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

type DbTicket = {
  id: number;
  subject: string;
  status: keyof typeof statusLabelMap;
};

type DbProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  node_id: string | null;
  plan_id: number | null;
  service_status: string;
  activation_date: string | null;
  renewal_date: string | null;
};

type DbPlan = {
  id: number;
  name: string;
  speed_down_mbps: number;
  speed_up_mbps: number;
  monthly_price_usd: number;
  monthly_quota_gb: number;
};

type DbNode = {
  id: string;
  name: string;
  monitor_enabled: boolean;
  probe_status: ProbeStatus;
  latency_ms: number | null;
  last_checked_at: string | null;
  last_seen_at: string | null;
  maintenance_mode: boolean;
  maintenance_message: string | null;
};

type DbPayment = {
  id: number;
  amount_usd: number;
  paid_at: string;
  payment_method: string;
  reference: string | null;
};

type DbAnnouncement = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

type DbServiceRequest = {
  id: number;
  request_type: keyof typeof requestTypeLabels;
  details: string;
  status: string;
  admin_note: string | null;
  created_at: string;
};

export default function PortalDashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [isAdmin, setIsAdmin] = useState(false);
  const [tickets, setTickets] = useState<DbTicket[]>([]);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [plan, setPlan] = useState<DbPlan | null>(null);
  const [node, setNode] = useState<DbNode | null>(null);
  const [payments, setPayments] = useState<DbPayment[]>([]);
  const [announcements, setAnnouncements] = useState<DbAnnouncement[]>([]);
  const [serviceRequests, setServiceRequests] = useState<DbServiceRequest[]>([]);
  const [globalMaintenance, setGlobalMaintenance] = useState(false);
  const [monitorHeartbeat, setMonitorHeartbeat] = useState<string | null>(null);
  const [dataError, setDataError] = useState("");
  const [requestType, setRequestType] = useState<keyof typeof requestTypeLabels>("technical_visit");
  const [requestDetails, setRequestDetails] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  const fetchDashboard = useCallback(async (userId: string) => {
    if (!supabase) return;
    setDataError("");

    const [profileResult, ticketsResult, paymentsResult, announcementsResult, requestsResult, networkResult] = await Promise.all([
      supabase
          .from("profiles")
          .select("id,full_name,phone,address,node_id,plan_id,service_status,activation_date,renewal_date")
          .eq("id", userId)
          .maybeSingle(),
      supabase
          .from("tickets")
          .select("id,subject,status")
          .eq("customer_id", userId)
          .neq("status", "resolved")
          .order("created_at", { ascending: false }),
      supabase
          .from("payments")
          .select("id,amount_usd,paid_at,payment_method,reference")
          .eq("customer_id", userId)
          .order("paid_at", { ascending: false })
          .limit(5),
      supabase
          .from("announcements")
          .select("id,title,body,created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      supabase
          .from("service_requests")
          .select("id,request_type,details,status,admin_note,created_at")
          .eq("customer_id", userId)
          .order("created_at", { ascending: false })
          .limit(8),
      supabase.rpc("get_my_network_status"),
    ]);

    const firstError = profileResult.error || ticketsResult.error || paymentsResult.error || announcementsResult.error || requestsResult.error || networkResult.error;
    if (firstError) setDataError(firstError.message);

    const nextProfile = (profileResult.data as DbProfile | null) ?? null;
    setProfile(nextProfile);
    setTickets((ticketsResult.data as DbTicket[] | null) ?? []);
    setPayments((paymentsResult.data as DbPayment[] | null) ?? []);
    setAnnouncements((announcementsResult.data as DbAnnouncement[] | null) ?? []);
    setServiceRequests((requestsResult.data as DbServiceRequest[] | null) ?? []);
    const networkRow = (Array.isArray(networkResult.data) ? networkResult.data[0] : null) as ({
      node_id: string | null; node_name: string | null; monitor_enabled: boolean; probe_status: ProbeStatus; latency_ms: number | null;
      last_checked_at: string | null; last_seen_at: string | null; maintenance_mode: boolean; maintenance_message: string | null;
      global_maintenance: boolean; monitor_heartbeat_at: string | null;
    } | null);
    setGlobalMaintenance(Boolean(networkRow?.global_maintenance));
    setMonitorHeartbeat(networkRow?.monitor_heartbeat_at ?? null);

    if (nextProfile?.plan_id) {
      const { data } = await supabase
          .from("plans")
          .select("id,name,speed_down_mbps,speed_up_mbps,monthly_price_usd,monthly_quota_gb")
          .eq("id", nextProfile.plan_id)
          .maybeSingle();
      setPlan((data as DbPlan | null) ?? null);
    } else {
      setPlan(null);
    }

    if (networkRow?.node_id) {
      setNode({
        id: networkRow.node_id,
        name: networkRow.node_name ?? "Assigned node",
        monitor_enabled: networkRow.monitor_enabled,
        probe_status: networkRow.probe_status ?? "unknown",
        latency_ms: networkRow.latency_ms,
        last_checked_at: networkRow.last_checked_at,
        last_seen_at: networkRow.last_seen_at,
        maintenance_mode: networkRow.maintenance_mode,
        maintenance_message: networkRow.maintenance_message,
      });
    } else {
      setNode(null);
    }
  }, [supabase]);

  const refreshMonitoring = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_my_network_status");
    if (error) {
      setDataError(`Could not refresh network status: ${error.message}`);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : null) as ({
      node_id: string | null; node_name: string | null; monitor_enabled: boolean; probe_status: ProbeStatus; latency_ms: number | null;
      last_checked_at: string | null; last_seen_at: string | null; maintenance_mode: boolean; maintenance_message: string | null;
      global_maintenance: boolean; monitor_heartbeat_at: string | null;
    } | null);
    setGlobalMaintenance(Boolean(row?.global_maintenance));
    setMonitorHeartbeat(row?.monitor_heartbeat_at ?? null);
    setNode(row?.node_id ? {
      id: row.node_id, name: row.node_name ?? "Assigned node", monitor_enabled: row.monitor_enabled, probe_status: row.probe_status ?? "unknown",
      latency_ms: row.latency_ms, last_checked_at: row.last_checked_at, last_seen_at: row.last_seen_at, maintenance_mode: row.maintenance_mode, maintenance_message: row.maintenance_message,
    } : null);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;
    let mounted = true;

    async function checkUser() {
      const { data, error } = await client.auth.getUser();
      if (!mounted) return;

      if (error || !data.user) {
        setAccount(null);
        setIsLoading(false);
        router.replace("/portal/login");
        return;
      }

      const admin = await resolveIsAdmin(client, data.user);
      if (!mounted) return;

      if (admin) {
        setIsAdmin(true);
        setIsLoading(false);
        router.replace("/admin");
        return;
      }

      setIsAdmin(false);
      setAccount(data.user);
      await fetchDashboard(data.user.id);
      if (mounted) setIsLoading(false);
    }

    void checkUser();

    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (!session?.user) {
        setAccount(null);
        setIsAdmin(false);
        setIsLoading(false);
        router.replace("/portal/login");
        return;
      }

      const admin = await resolveIsAdmin(client, session.user);
      if (!mounted) return;

      if (admin) {
        setIsAdmin(true);
        router.replace("/admin");
        return;
      }

      setIsAdmin(false);
      setAccount(session.user);
      await fetchDashboard(session.user.id);
      if (mounted) setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase, fetchDashboard]);

  useEffect(() => {
    if (!supabase || !account) return;
    const refresh = () => void refreshMonitoring();
    const interval = window.setInterval(refresh, 10_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [account, refreshMonitoring, supabase]);

  const renewalState = useMemo(() => {
    if (!profile?.renewal_date) return { label: "Not scheduled", className: "status-inactive" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewal = new Date(`${profile.renewal_date}T00:00:00`);
    const days = Math.ceil((renewal.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return { label: "Renewal overdue", className: "status-suspended" };
    if (days <= 7) return { label: "Due soon", className: "status-maintenance" };
    return { label: "Scheduled", className: "status-active" };
  }, [profile?.renewal_date]);

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  }

  async function submitServiceRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !account || !requestDetails.trim()) return;
    setIsSubmittingRequest(true);
    setRequestError("");
    setRequestMessage("");

    const { error } = await supabase.from("service_requests").insert({
      customer_id: account.id,
      request_type: requestType,
      details: requestDetails.trim(),
      status: "submitted",
    });

    if (error) {
      setRequestError(error.message);
    } else {
      setRequestDetails("");
      setRequestMessage("Request sent to Centrum. You can track its status below.");
      await fetchDashboard(account.id);
    }
    setIsSubmittingRequest(false);
  }

  if (isLoading) return <section><h1>Customer Dashboard</h1><p className="page-intro">Loading account data...</p></section>;
  if (!supabase) return <section><h1>Customer Dashboard</h1><p className="page-intro">Supabase is not configured yet.</p></section>;
  if (!account) {
    return (
        <section>
          <h1>Customer Dashboard</h1>
          <p className="page-intro">Please sign in to manage your Centrum account.</p>
          <div className="section-actions"><Link href="/portal/login" className="btn btn-primary">Go to login</Link></div>
        </section>
    );
  }

  const displayName = profile?.full_name || readFullName(account);
  const serviceStatus = profile?.service_status ?? "active";
  const latestPayment = payments[0] ?? null;
  const customerNodeState = deriveCustomerNodeState(node, globalMaintenance, monitorHeartbeat);

  return (
      <section className="animate-fade-in portal-dashboard">
        <div className={`badge badge-pulse page-badge customer-network-badge customer-network-${customerNodeState.key}`}>Your Node: {customerNodeState.label}</div>
        <div className="portal-heading-row">
          <div>
            <h1>Customer Dashboard</h1>
            <p className="page-intro">Welcome back, {displayName}. Everything here is managed directly by Centrum Service.</p>
          </div>
          <div className="section-actions portal-heading-actions">
            {isAdmin ? <Link href="/admin" className="btn btn-secondary">Admin Dashboard</Link> : null}
            <ServiceCustomizationWizard
                defaults={{ fullName: displayName, email: account.email ?? "", phone: profile?.phone ?? "", address: profile?.address ?? "", preferredPlanId: profile?.plan_id ?? null }}
                triggerLabel="Help Me Customize My Service"
                triggerClassName="btn btn-primary"
            />
            <Link href="/portal/account" className="btn btn-secondary">Account Settings</Link>
            <button type="button" className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        {dataError ? <p className="form-alert form-alert-error">Some portal data could not load: {dataError}. Make sure the required Supabase migrations have been applied.</p> : null}

        <div className="dashboard-card-grid">
          <article className="card dashboard-summary-card">
            <div className="badge card-badge">Service</div>
            <h2>Current Plan</h2>
            {plan ? (
                <>
                  <p className="dashboard-big-value">{plan.name}</p>
                  <div className="dashboard-metrics">
                    <span><strong>{plan.speed_down_mbps}</strong> Mbps down</span>
                    <span><strong>{plan.speed_up_mbps}</strong> Mbps up</span>
                    <span><strong>${plan.monthly_price_usd}</strong>/month</span>
                  </div>
                </>
            ) : <p className="empty-state">No plan has been assigned yet.</p>}
          </article>

          <article className="card dashboard-summary-card">
            <div className="badge card-badge">Connection</div>
            <h2>Service Status</h2>
            <p className="dashboard-big-value"><span className={`status-pill customer-node-status customer-node-${customerNodeState.key}`}>{customerNodeState.label}</span></p>
            <p className="field-note customer-node-message">{customerNodeState.message}</p>
            <div className="dashboard-detail-list">
              <span><strong>Node:</strong> {node?.name ?? "Not assigned"}</span>
              <span><strong>Account:</strong> {formatStatus(serviceStatus)}</span>
              {node?.latency_ms !== null && node?.latency_ms !== undefined ? <span><strong>Latency:</strong> {node.latency_ms} ms</span> : null}
              <span><strong>Address:</strong> {profile?.address ?? "Not provided"}</span>
              <span><strong>Activated:</strong> {formatDate(profile?.activation_date)}</span>
            </div>
          </article>

          <article className="card dashboard-summary-card">
            <div className="badge card-badge">Billing</div>
            <h2>Next Renewal</h2>
            <p className="dashboard-big-value">{formatDate(profile?.renewal_date)}</p>
            <span className={`status-pill ${renewalState.className}`}>{renewalState.label}</span>
            {plan ? <p className="field-note">Expected plan charge: ${plan.monthly_price_usd}</p> : null}
          </article>

          <article className="card dashboard-summary-card">
            <div className="badge card-badge">Last Payment</div>
            <h2>Payment Record</h2>
            {latestPayment ? (
                <>
                  <p className="dashboard-big-value">${Number(latestPayment.amount_usd).toFixed(2)}</p>
                  <div className="dashboard-detail-list">
                    <span>{formatDateTime(latestPayment.paid_at)}</span>
                    <span>{formatStatus(latestPayment.payment_method)}</span>
                    {latestPayment.reference ? <span>Ref: {latestPayment.reference}</span> : null}
                  </div>
                </>
            ) : <p className="empty-state">No payment has been recorded yet.</p>}
          </article>
        </div>

        <div className="section-grid portal-two-col">
          <article className="card">
            <div className="badge card-badge">Communication</div>
            <h2>Active Tickets</h2>
            <ul className="simple-list compact-scroll-list" style={{ marginTop: "1rem" }}>
              {tickets.length ? tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link href={`/portal/tickets/${ticket.id}`} className="ticket-row">
                      <span><strong>#{ticket.id}</strong> · {ticket.subject}</span>
                      <span className={`status-pill status-${ticket.status}`}>{statusLabelMap[ticket.status] ?? ticket.status}</span>
                    </Link>
                  </li>
              )) : <li className="empty-state">No active tickets.</li>}
            </ul>
            <div className="section-actions"><Link href="/portal/tickets/new" className="btn btn-primary">Create New Ticket</Link></div>
          </article>

          <article className="card">
            <div className="badge card-badge">Notices</div>
            <h2>Announcements</h2>
            <div className="portal-feed compact-scroll-list">
              {announcements.length ? announcements.map((announcement) => (
                  <div className="portal-feed-item" key={announcement.id}>
                    <strong>{announcement.title}</strong>
                    <p>{announcement.body}</p>
                    <span>{formatDateTime(announcement.created_at)}</span>
                  </div>
              )) : <p className="empty-state">No current announcements.</p>}
            </div>
          </article>
        </div>

        <div className="section-grid portal-two-col">
          <article className="card">
            <div className="badge card-badge">Requests</div>
            <h2>Request a Service Change</h2>
            <p className="page-intro">Ask for a technical visit, plan change, relocation, equipment replacement, or another account action.</p>
            <form className="form-grid" onSubmit={submitServiceRequest}>
              <label>Request type
                <select value={requestType} onChange={(event) => setRequestType(event.target.value as keyof typeof requestTypeLabels)}>
                  {Object.entries(requestTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Details
                <textarea rows={5} value={requestDetails} onChange={(event) => setRequestDetails(event.target.value)} placeholder="Tell us what you need and any timing or location details." required />
              </label>
              {requestError ? <p className="form-alert form-alert-error">{requestError}</p> : null}
              {requestMessage ? <p className="form-alert form-alert-success">{requestMessage}</p> : null}
              <button className="btn btn-primary" type="submit" disabled={isSubmittingRequest}>{isSubmittingRequest ? "Sending..." : "Send Request"}</button>
            </form>
          </article>

          <article className="card">
            <div className="badge card-badge">History</div>
            <h2>Service Requests</h2>
            <div className="portal-feed compact-scroll-list">
              {serviceRequests.length ? serviceRequests.map((request) => (
                  <div className="portal-feed-item" key={request.id}>
                    <div className="portal-feed-heading">
                      <strong>#{request.id} · {requestTypeLabels[request.request_type] ?? formatStatus(request.request_type)}</strong>
                      <span className={`status-pill status-${request.status}`}>{requestStatusLabels[request.status] ?? formatStatus(request.status)}</span>
                    </div>
                    <p>{request.details}</p>
                    {request.admin_note ? <p className="field-note"><strong>Centrum:</strong> {request.admin_note}</p> : null}
                    <span>{formatDateTime(request.created_at)}</span>
                  </div>
              )) : <p className="empty-state">No service requests yet.</p>}
            </div>
          </article>
        </div>

        <article className="card">
          <div className="badge card-badge">Billing History</div>
          <h2>Recent Payments</h2>
          <div className="portal-payment-list compact-scroll-list">
            {payments.length ? payments.map((payment) => (
                <div className="portal-payment-row" key={payment.id}>
                  <div><strong>${Number(payment.amount_usd).toFixed(2)}</strong><span>{formatDateTime(payment.paid_at)}</span></div>
                  <div><span>{formatStatus(payment.payment_method)}</span>{payment.reference ? <code>{payment.reference}</code> : null}</div>
                </div>
            )) : <p className="empty-state">No payment records yet.</p>}
          </div>
        </article>
      </section>
  );
}

function readFullName(account: User) {
  const metadataFullName = account.user_metadata?.full_name;
  if (typeof metadataFullName === "string" && metadataFullName.trim()) return metadataFullName;
  const fallbackName = (account.email ?? "Customer").split("@")[0] ?? "Customer";
  return fallbackName.split(/[._-]/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}