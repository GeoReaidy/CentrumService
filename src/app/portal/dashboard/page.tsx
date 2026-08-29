'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveUserRole, roleHome } from "@/lib/supabase-role";
import { deriveCustomerNodeState, type ProbeStatus } from "@/lib/network-monitoring";
import { ServiceCustomizationWizard } from "@/components/ServiceCustomizationWizard";
import { LocationCapture, type CapturedLocation } from "@/components/LocationCapture";
import { AsyncState } from "@/components/AsyncState";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import { useLanguage } from "@/components/LanguageProvider";
import { localizedDateLocale, localizedField, type Locale } from "@/lib/i18n";
import { translateUiText } from "@/lib/ui-translations";

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

type PortalWorkspace = "overview" | "service" | "billing" | "support" | "account";
type PortalMode = "simple" | "advanced";

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
  name_fr: string | null;
  name_ar: string | null;
  description: string | null;
  description_fr: string | null;
  description_ar: string | null;
  speed_down_mbps: number | null;
  speed_up_mbps: number | null;
  monthly_price_usd: number;
  monthly_quota_gb: number | null;
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
  title_fr: string | null;
  title_ar: string | null;
  body: string;
  body_fr: string | null;
  body_ar: string | null;
  created_at: string;
};

type DbServiceRequest = {
  id: number;
  request_type: keyof typeof requestTypeLabels;
  details: string;
  status: string;
  admin_note: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  location_accuracy_m: number | null;
  location_captured_at: string | null;
  created_at: string;
};

type DbCustomerLocation = {
  customer_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  captured_at: string;
  updated_at: string;
};

type DbCustomizationRequest = {
  id: number;
  preferred_plan_name: string | null;
  status: string;
  created_at: string;
};

export default function PortalDashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const { locale } = useLanguage();
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
  const [customizationRequests, setCustomizationRequests] = useState<DbCustomizationRequest[]>([]);
  const [savedLocation, setSavedLocation] = useState<CapturedLocation | null>(null);
  const [locationDraft, setLocationDraft] = useState<CapturedLocation | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationError, setLocationError] = useState("");
  const [globalMaintenance, setGlobalMaintenance] = useState(false);
  const [monitorHeartbeat, setMonitorHeartbeat] = useState<string | null>(null);
  const [dataError, setDataError] = useState("");
  const [requestType, setRequestType] = useState<keyof typeof requestTypeLabels>("technical_visit");
  const [requestDetails, setRequestDetails] = useState("");
  const [requestLocation, setRequestLocation] = useState<CapturedLocation | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<PortalWorkspace>("overview");
  const [portalMode, setPortalMode] = useState<PortalMode>("simple");
  const [notificationDeepLink, setNotificationDeepLink] = useState({
    highlightRequest: "",
    highlightCustomization: "",
    highlightAnnouncement: "",
  });

  const fetchDashboard = useCallback(async (userId: string) => {
    if (!supabase) return;
    setDataError("");

    const [profileResult, locationResult, ticketsResult, paymentsResult, announcementsResult, requestsResult, customizationResult, preferenceResult, networkResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,phone,address,node_id,plan_id,service_status,activation_date,renewal_date")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("customer_locations")
        .select("customer_id,latitude,longitude,accuracy_m,captured_at,updated_at")
        .eq("customer_id", userId)
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
        .select("id,title,title_fr,title_ar,body,body_fr,body_ar,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("service_requests")
        .select("id,request_type,details,status,admin_note,location_latitude,location_longitude,location_accuracy_m,location_captured_at,created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("service_customization_requests")
        .select("id,preferred_plan_name,status,created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("customer_portal_preferences")
        .select("portal_mode")
        .eq("customer_id", userId)
        .maybeSingle(),
      supabase.rpc("get_my_network_status"),
    ]);

    const firstError = profileResult.error || locationResult.error || ticketsResult.error || paymentsResult.error || announcementsResult.error || requestsResult.error || customizationResult.error || preferenceResult.error || networkResult.error;
    if (firstError) {
      console.error("Customer dashboard data load failed", firstError);
      setDataError(toFriendlyErrorMessage(firstError, "Some account information could not be loaded right now."));
    }

    const nextProfile = (profileResult.data as DbProfile | null) ?? null;
    const nextLocation = toCapturedLocation((locationResult.data as DbCustomerLocation | null) ?? null);
    setProfile(nextProfile);
    setSavedLocation(nextLocation);
    setLocationDraft(nextLocation);
    setTickets((ticketsResult.data as DbTicket[] | null) ?? []);
    setPayments((paymentsResult.data as DbPayment[] | null) ?? []);
    setAnnouncements((announcementsResult.data as DbAnnouncement[] | null) ?? []);
    setServiceRequests((requestsResult.data as DbServiceRequest[] | null) ?? []);
    setCustomizationRequests((customizationResult.data as DbCustomizationRequest[] | null) ?? []);
    const savedPortalMode = (preferenceResult.data as { portal_mode?: string } | null)?.portal_mode;
    setPortalMode(savedPortalMode === "advanced" ? "advanced" : "simple");
    const networkRow = (Array.isArray(networkResult.data) ? networkResult.data[0] : null) as ({
      node_id: string | null; node_name: string | null; monitor_enabled: boolean; probe_status: ProbeStatus; latency_ms: number | null;
      last_checked_at: string | null; last_seen_at: string | null; maintenance_mode: boolean; maintenance_message: string | null;
      global_maintenance: boolean; monitor_heartbeat_at: string | null;
    } | null);
    setGlobalMaintenance(Boolean(networkRow?.global_maintenance));
    setMonitorHeartbeat(networkRow?.monitor_heartbeat_at ?? null);

    if (nextProfile?.plan_id) {
      const { data, error: planError } = await supabase
        .from("plans")
        .select("id,name,name_fr,name_ar,description,description_fr,description_ar,speed_down_mbps,speed_up_mbps,monthly_price_usd,monthly_quota_gb")
        .eq("id", nextProfile.plan_id)
        .maybeSingle();
      if (planError) {
        console.error("Customer assigned plan load failed", planError);
        setDataError((current) => current || toFriendlyErrorMessage(planError, "Your plan details could not be loaded right now."));
      }
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
      console.error("Customer network status refresh failed", error);
      setDataError(toFriendlyErrorMessage(error, "Your live network status could not be refreshed right now."));
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

      const role = await resolveUserRole(client, data.user);
      if (!mounted) return;

      if (role === "admin" || role === "manager") {
        setIsAdmin(role === "admin");
        setIsLoading(false);
        router.replace(roleHome(role));
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

      const role = await resolveUserRole(client, session.user);
      if (!mounted) return;

      if (role === "admin" || role === "manager") {
        setIsAdmin(role === "admin");
        router.replace(roleHome(role));
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

  const openServiceRequestCount = useMemo(() => serviceRequests.filter((request) => !["completed", "declined", "cancelled"].includes(request.status)).length, [serviceRequests]);

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedWorkspace = params.get("workspace");
    if (requestedWorkspace && ["overview", "service", "billing", "support", "account"].includes(requestedWorkspace)) {
      setActiveWorkspace(requestedWorkspace as PortalWorkspace);
    }
    setNotificationDeepLink({
      highlightRequest: params.get("highlightRequest") ?? "",
      highlightCustomization: params.get("highlightCustomization") ?? "",
      highlightAnnouncement: params.get("highlightAnnouncement") ?? "",
    });
  }, []);

  useEffect(() => {
    const targetId = notificationDeepLink.highlightRequest
      ? `service-request-${notificationDeepLink.highlightRequest}`
      : notificationDeepLink.highlightCustomization
        ? `customization-request-${notificationDeepLink.highlightCustomization}`
        : notificationDeepLink.highlightAnnouncement
          ? `announcement-${notificationDeepLink.highlightAnnouncement}`
          : null;
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeWorkspace, announcements, customizationRequests, notificationDeepLink, serviceRequests]);

  async function saveServiceLocation(nextLocation?: CapturedLocation) {
    const targetLocation = nextLocation ?? locationDraft;
    if (!supabase || !account || !targetLocation || locationSaving) return;
    setLocationSaving(true);
    setLocationError("");
    setLocationMessage("");
    const payload = {
      customer_id: account.id,
      latitude: targetLocation.latitude,
      longitude: targetLocation.longitude,
      accuracy_m: targetLocation.accuracyM,
      captured_at: targetLocation.capturedAt,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("customer_locations").upsert(payload, { onConflict: "customer_id" });
    if (error) {
      setLocationDraft(savedLocation);
      setLocationError(toFriendlyErrorMessage(error, "Your service location could not be saved right now."));
    } else {
      setSavedLocation(targetLocation);
      setLocationDraft(targetLocation);
      setLocationMessage("Location uploaded successfully. Centrum staff can use it when helping with your service.");
    }
    setLocationSaving(false);
  }

  async function clearServiceLocation() {
    if (!supabase || !account || locationSaving) return;
    if (!window.confirm(translateUiText("Remove your saved service location from Centrum?", locale))) return;
    setLocationSaving(true);
    setLocationError("");
    setLocationMessage("");
    const { error } = await supabase.from("customer_locations").delete().eq("customer_id", account.id);
    if (error) {
      setLocationError(toFriendlyErrorMessage(error, "Your saved location could not be removed right now."));
    } else {
      setSavedLocation(null);
      setLocationDraft(null);
      setLocationMessage("Your saved service location was removed.");
    }
    setLocationSaving(false);
  }

  async function submitServiceRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !account || !requestDetails.trim()) return;
    setIsSubmittingRequest(true);
    setRequestError("");
    setRequestMessage("");

    const submittedLocation = requestType === "technical_visit" ? requestLocation : null;
    const { error } = await supabase.from("service_requests").insert({
      customer_id: account.id,
      request_type: requestType,
      details: requestDetails.trim(),
      location_latitude: submittedLocation?.latitude ?? null,
      location_longitude: submittedLocation?.longitude ?? null,
      location_accuracy_m: submittedLocation?.accuracyM ?? null,
      location_captured_at: submittedLocation?.capturedAt ?? null,
      status: "submitted",
    });

    if (error) {
      console.error("Service request submission failed", error);
      setRequestError(toFriendlyErrorMessage(error, "We couldn't send your service request right now. Please try again."));
    } else {
      setRequestDetails("");
      setRequestLocation(null);
      setRequestMessage("Request sent to Centrum. You can track its status below.");
      await fetchDashboard(account.id);
    }
    setIsSubmittingRequest(false);
  }

  if (isLoading) return <section className="portal-dashboard"><AsyncState kind="loading" eyebrow="Customer Portal" title="Loading your dashboard" message="Getting your account, billing, tickets, requests, and live network status." /></section>;
  if (!supabase) return <section className="portal-dashboard"><AsyncState kind="error" eyebrow="Portal Unavailable" title="Account services are temporarily unavailable" message="Centrum couldn't connect to the account service. Please try again shortly." href="/contact" hrefLabel="Contact Centrum" /></section>;
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
  const latestTicket = tickets[0] ?? null;
  const latestServiceRequest = serviceRequests[0] ?? null;
  const recentAnnouncements = announcements.slice(0, 3);

  function scrollToSimpleSection(id: string) {
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  if (portalMode === "simple") {
    return (
      <section className="animate-fade-in portal-dashboard portal-simple-page">
        <div className="portal-console-header portal-simple-header">
          <div>
            <div className={`badge badge-pulse page-badge customer-network-badge customer-network-${customerNodeState.key}`}>
              Service: {customerNodeState.label}
            </div>
            <h1>Welcome, {displayName}</h1>
            <p className="page-intro">Everything you normally need from Centrum is right here on one page.</p>
          </div>
          <div className="section-actions portal-console-header-actions">
            <Link href="/portal/account" className="btn btn-primary">Account Settings</Link>
            <button type="button" className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        {dataError ? (
          <AsyncState
            kind="error"
            eyebrow="Partial Data"
            title="Some account information couldn't load"
            message={dataError}
            onRetry={() => account && void fetchDashboard(account.id)}
            retryLabel="Retry"
          />
        ) : null}

        <div className="portal-simple-stack">
          <section className="portal-simple-summary-grid" aria-label="Account summary">
            <article className="card portal-simple-summary-card">
              <div className="badge card-badge">Your Plan</div>
              <h2>{plan ? localizedField(plan as unknown as Record<string, unknown>, "name", locale) : "No plan assigned"}</h2>
              {plan && localizedField(plan as unknown as Record<string, unknown>, "description", locale) ? <p className="plan-description">{localizedField(plan as unknown as Record<string, unknown>, "description", locale)}</p> : null}
              {plan ? (
                <div className="portal-simple-plan-facts">
                  {plan.speed_down_mbps !== null ? <span><strong>{plan.speed_down_mbps}</strong> Mbps down</span> : null}
                  {plan.speed_up_mbps !== null ? <span><strong>{plan.speed_up_mbps}</strong> Mbps up</span> : null}
                  {plan.monthly_quota_gb !== null ? <span><strong>{plan.monthly_quota_gb}</strong> GB quota</span> : null}
                  <span><strong>${plan.monthly_price_usd}</strong>/month</span>
                </div>
              ) : <p className="empty-state">Centrum has not assigned a plan yet.</p>}
              <div className="section-actions portal-inline-actions">
                <ServiceCustomizationWizard
                  defaults={{ fullName: displayName, email: account.email ?? "", phone: profile?.phone ?? "", address: profile?.address ?? "", preferredPlanId: profile?.plan_id ?? null, location: savedLocation }}
                  triggerLabel="Customize My Service"
                  triggerClassName="btn btn-secondary"
                />
              </div>
            </article>

            <article className="card portal-simple-summary-card">
              <div className="badge card-badge">Service</div>
              <h2>{customerNodeState.label}</h2>
              <span className={`status-pill customer-node-status customer-node-${customerNodeState.key}`}>{customerNodeState.label}</span>
              <p className="field-note customer-node-message">{customerNodeState.message}</p>
              <div className="dashboard-detail-list">
                <span><strong>Account:</strong> {formatStatus(serviceStatus)}</span>
                <span><strong>Address:</strong> {profile?.address ?? "Not provided"}</span>
              </div>
            </article>

            <article className="card portal-simple-summary-card">
              <div className="badge card-badge">Renewal</div>
              <h2>{formatDate(profile?.renewal_date, locale)}</h2>
              <span className={`status-pill ${renewalState.className}`}>{renewalState.label}</span>
              {plan ? <p className="field-note">Current plan: ${plan.monthly_price_usd}/month</p> : null}
              {latestPayment ? (
                <p className="field-note">Last payment: ${Number(latestPayment.amount_usd).toFixed(2)} · {formatDateTime(latestPayment.paid_at, locale)}</p>
              ) : <p className="field-note">No payment has been recorded yet.</p>}
            </article>
          </section>

          <article className="card portal-simple-actions-card">
            <div>
              <div className="badge card-badge">Quick Actions</div>
              <h2>What do you need?</h2>
              <p className="page-intro">The common actions are kept here so you do not need to dig through menus.</p>
            </div>
            <div className="portal-simple-action-grid">
              <Link href="/portal/tickets/new" className="btn btn-primary">Report a Problem</Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRequestType("technical_visit");
                  scrollToSimpleSection("simple-service-request");
                }}
              >
                Request Technician
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => scrollToSimpleSection("simple-location")}>Update Location</button>
              <Link href="/portal/live-chat" className="btn btn-secondary">Contact Support</Link>
            </div>
          </article>

          <section className="portal-simple-two-col">
            <article className="card">
              <div className="section-heading-row">
                <div>
                  <div className="badge card-badge">Support</div>
                  <h2>Latest support</h2>
                </div>
                {latestTicket ? <span className={`status-pill status-${latestTicket.status}`}>{statusLabelMap[latestTicket.status] ?? latestTicket.status}</span> : null}
              </div>
              {latestTicket ? (
                <Link href={`/portal/tickets/${latestTicket.id}`} className="portal-simple-primary-row">
                  <span><strong>#{latestTicket.id}</strong> · {latestTicket.subject}</span>
                  <span>Open →</span>
                </Link>
              ) : <p className="empty-state">You have no active support tickets.</p>}
              <div className="section-actions">
                <Link href="/portal/tickets/new" className="btn btn-secondary">New Ticket</Link>
                <Link href="/portal/live-chat" className="btn btn-secondary">Live Chat</Link>
              </div>
            </article>

            <article className="card">
              <div className="section-heading-row">
                <div>
                  <div className="badge card-badge">Requests</div>
                  <h2>Latest service request</h2>
                </div>
                {latestServiceRequest ? <span className={`status-pill status-${latestServiceRequest.status}`}>{requestStatusLabels[latestServiceRequest.status] ?? formatStatus(latestServiceRequest.status)}</span> : null}
              </div>
              {latestServiceRequest ? (
                <div
                  className={`portal-feed-item portal-simple-request-preview ${notificationDeepLink.highlightRequest === String(latestServiceRequest.id) ? "notification-highlight" : ""}`}
                  id={`service-request-${latestServiceRequest.id}`}
                >
                  <strong>#{latestServiceRequest.id} · {requestTypeLabels[latestServiceRequest.request_type] ?? formatStatus(latestServiceRequest.request_type)}</strong>
                  <p>{latestServiceRequest.details}</p>
                  {latestServiceRequest.admin_note ? <p className="field-note"><strong>Centrum:</strong> {latestServiceRequest.admin_note}</p> : null}
                  <span>{formatDateTime(latestServiceRequest.created_at, locale)}</span>
                </div>
              ) : <p className="empty-state">No service requests yet.</p>}
              <button type="button" className="btn btn-secondary" onClick={() => scrollToSimpleSection("simple-service-request")}>New Service Request</button>
            </article>
          </section>

          <article className="card portal-simple-request-card" id="simple-service-request">
            <div className="badge card-badge">Service Request</div>
            <h2>Ask Centrum for a service change</h2>
            <p className="page-intro">Use this for a technician visit, plan change, relocation, equipment replacement, or another service request.</p>
            <form className="form-grid" onSubmit={submitServiceRequest}>
              <label>
                Request type
                <select value={requestType} onChange={(event) => setRequestType(event.target.value as keyof typeof requestTypeLabels)}>
                  {Object.entries(requestTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Details
                <textarea rows={4} value={requestDetails} onChange={(event) => setRequestDetails(event.target.value)} placeholder="Tell us what you need." required />
              </label>
              {requestType === "technical_visit" ? (
                <LocationCapture
                  value={requestLocation}
                  onChange={setRequestLocation}
                  title="Technician visit location"
                  description="Optional. You can use your saved service location or choose another point."
                  preset={savedLocation}
                  presetLabel="Use my saved service location"
                />
              ) : null}
              {requestError ? <p className="form-alert form-alert-error">{requestError}</p> : null}
              {requestMessage ? <p className="form-alert form-alert-success">{requestMessage}</p> : null}
              <button className="btn btn-primary" type="submit" disabled={isSubmittingRequest}>{isSubmittingRequest ? "Sending..." : "Send Request"}</button>
            </form>
          </article>

          <article className="card portal-location-card" id="simple-location">
            <div className="badge card-badge">Service Location</div>
            <h2>Your saved service location</h2>
            <p className="page-intro">Keep your installation point saved so Centrum can find you quickly when support or a technician visit is needed.</p>
            <LocationCapture
              value={locationDraft}
              onChange={(nextLocation) => {
                if (nextLocation) void saveServiceLocation(nextLocation);
              }}
              title="Your service location"
              description="Tap Upload location, choose the correct point on Google Maps, then send it."
              disabled={locationSaving}
              allowClear={false}
            />
            {locationSaving ? <p className="field-note">Uploading your location...</p> : null}
            {locationError ? <p className="form-alert form-alert-error">{locationError}</p> : null}
            {locationMessage ? <p className="form-alert form-alert-success">{locationMessage}</p> : null}
            {savedLocation ? (
              <div className="section-actions portal-location-actions">
                <button type="button" className="btn btn-secondary" disabled={locationSaving} onClick={() => void clearServiceLocation()}>Remove saved location</button>
              </div>
            ) : null}
          </article>

          <section className="portal-simple-two-col">
            <article className="card">
              <div className="badge card-badge">Billing</div>
              <h2>Renewal & payment</h2>
              <div className="dashboard-detail-list">
                <span><strong>Next renewal:</strong> {formatDate(profile?.renewal_date, locale)}</span>
                <span><strong>Status:</strong> {renewalState.label}</span>
                {plan ? <span><strong>Plan price:</strong> ${plan.monthly_price_usd}/month</span> : null}
                {latestPayment ? <span><strong>Last payment:</strong> ${Number(latestPayment.amount_usd).toFixed(2)} on {formatDateTime(latestPayment.paid_at, locale)}</span> : null}
              </div>
            </article>

            <article className="card">
              <div className="badge card-badge">Notices</div>
              <h2>Important updates</h2>
              <div className="portal-feed portal-simple-announcements">
                {recentAnnouncements.length ? recentAnnouncements.map((announcement) => (
                  <div
                    className={`portal-feed-item ${notificationDeepLink.highlightAnnouncement === String(announcement.id) ? "notification-highlight" : ""}`}
                    id={`announcement-${announcement.id}`}
                    key={announcement.id}
                  >
                    <strong>{localizedField(announcement as unknown as Record<string, unknown>, "title", locale)}</strong>
                    <p>{localizedField(announcement as unknown as Record<string, unknown>, "body", locale)}</p>
                    <span>{formatDateTime(announcement.created_at, locale)}</span>
                  </div>
                )) : <p className="empty-state">No current announcements.</p>}
              </div>
            </article>
          </section>

          <article className="card portal-simple-settings-card">
            <div>
              <div className="badge card-badge">Account</div>
              <h2>Need the full portal?</h2>
              <p className="page-intro">Simple mode keeps the everyday tools on this page. Advanced mode restores the full workspace menu.</p>
            </div>
            <Link href="/portal/account" className="btn btn-secondary">Account Settings</Link>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-fade-in portal-dashboard portal-console-page">
      <div className="portal-console-header">
        <div>
          <div className={`badge badge-pulse page-badge customer-network-badge customer-network-${customerNodeState.key}`}>Your Node: {customerNodeState.label}</div>
          <h1>Customer Portal</h1>
          <p className="page-intro">{formatWelcomeBack(displayName, locale)}</p>
        </div>

        <div className="section-actions portal-console-header-actions">
          <Link href="/portal/account" className="btn btn-primary">Account Settings</Link>
          <button type="button" className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>

      {dataError ? (
        <AsyncState
          kind="error"
          eyebrow="Partial Data"
          title="Some portal information couldn't load"
          message={dataError}
          onRetry={() => account && void fetchDashboard(account.id)}
          retryLabel="Retry Portal Data"
        />
      ) : null}

      <div className="portal-console-shell">
        <aside className="portal-console-sidebar">
          <div className="admin-sidebar-section">
            <span className="admin-sidebar-eyebrow">Portal</span>
            <div className="admin-submenu portal-submenu">
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "overview" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("overview")}>
                <span><strong>Overview</strong><small>At a glance</small></span>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "service" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("service")}>
                <span><strong>My Service</strong><small>Plan, node & requests</small></span>
                <b>{openServiceRequestCount}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "billing" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("billing")}>
                <span><strong>Billing</strong><small>Renewal & payments</small></span>
                <b>{payments.length}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "support" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("support")}>
                <span><strong>Support</strong><small>Tickets & notices</small></span>
                <b>{tickets.length}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "account" ? "is-active" : ""}`} onClick={() => setActiveWorkspace("account")}>
                <span><strong>Account</strong><small>Profile & settings</small></span>
              </button>
            </div>
          </div>

          <div className="admin-sidebar-section portal-sidebar-tools">
            <span className="admin-sidebar-eyebrow">Quick Actions</span>
            <Link href="/portal/live-chat" className="admin-tool-link">
              <span><strong>Live Chat</strong><small>Talk to Centrum</small></span>
              <span>→</span>
            </Link>
            <Link href="/portal/tickets/new" className="admin-tool-link">
              <span><strong>New Ticket</strong><small>Ask for support</small></span>
              <span>→</span>
            </Link>
            <Link href="/portal/account" className="admin-tool-link portal-account-tool-link">
              <span><strong>Account Settings</strong><small>Password & deletion</small></span>
              <span>→</span>
            </Link>
          </div>
        </aside>

        <div className="portal-console-content">
          {activeWorkspace === "overview" ? (
            <div className="portal-workspace">
              <div className="admin-workspace-heading portal-workspace-heading">
                <div>
                  <div className="badge card-badge">Overview</div>
                  <h2>Your Centrum account</h2>
                  <p className="page-intro">The important stuff first, without the whole portal stacked into one long page.</p>
                </div>
              </div>

              <div className="portal-overview-grid">
                <button type="button" className="admin-overview-card" onClick={() => setActiveWorkspace("service")}>
                  <span className="admin-overview-label">Current Plan</span>
                  <strong>{plan ? localizedField(plan as unknown as Record<string, unknown>, "name", locale) : "Not assigned"}</strong>
                  <small>{plan ? formatPlanSpeedSummary(plan) : "Centrum has not assigned a plan yet."}</small>
                  <span className="admin-overview-action">Open service →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => setActiveWorkspace("service")}>
                  <span className="admin-overview-label">Connection</span>
                  <strong>{customerNodeState.label}</strong>
                  <small>{node?.name ? `${node.name}${node.latency_ms !== null ? ` · ${node.latency_ms} ms` : ""}` : "No service node assigned yet."}</small>
                  <span className="admin-overview-action">View connection →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => setActiveWorkspace("billing")}>
                  <span className="admin-overview-label">Next Renewal</span>
                  <strong>{formatDate(profile?.renewal_date, locale)}</strong>
                  <small>{renewalState.label}{plan ? ` · $${plan.monthly_price_usd}/month` : ""}</small>
                  <span className="admin-overview-action">Open billing →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => setActiveWorkspace("support")}>
                  <span className="admin-overview-label">Support</span>
                  <strong>{formatActiveTicketCount(tickets.length, locale)}</strong>
                  <small>{announcements.length ? formatRecentNoticeCount(announcements.length, locale) : "No current announcements."}</small>
                  <span className="admin-overview-action">Open support →</span>
                </button>
              </div>

              <div className="section-grid portal-overview-secondary">
                <article className="card portal-overview-status-card">
                  <div className="badge card-badge">Service Status</div>
                  <div className="portal-overview-status-line">
                    <span className={`status-pill customer-node-status customer-node-${customerNodeState.key}`}>{customerNodeState.label}</span>
                    <span className={`status-pill status-${serviceStatus}`}>{formatStatus(serviceStatus)}</span>
                  </div>
                  <p className="field-note customer-node-message">{customerNodeState.message}</p>
                  <div className="dashboard-detail-list">
                    <span><strong>Node:</strong> {node?.name ?? "Not assigned"}</span>
                    <span><strong>Address:</strong> {profile?.address ?? "Not provided"}</span>
                    <span><strong>Activated:</strong> {formatDate(profile?.activation_date, locale)}</span>
                  </div>
                </article>

                <article className="card portal-overview-actions-card">
                  <div className="badge card-badge">Quick Actions</div>
                  <h2>What do you need?</h2>
                  <div className="portal-quick-action-grid">
                    <Link href="/portal/tickets/new" className="btn btn-primary">Create Ticket</Link>
                    <Link href="/portal/live-chat" className="btn btn-secondary">Start Live Chat</Link>
                    <button type="button" className="btn btn-secondary" onClick={() => setActiveWorkspace("service")}>Service Request</button>
                    <Link href="/portal/account" className="btn btn-secondary">Account Settings</Link>
                  </div>
                </article>
              </div>
            </div>
          ) : null}

          {activeWorkspace === "service" ? (
            <div className="portal-workspace">
              <div className="admin-workspace-heading portal-workspace-heading">
                <div>
                  <div className="badge card-badge">My Service</div>
                  <h2>Plan & connection</h2>
                  <p className="page-intro">Your assigned plan, live node state, and service-change requests in one place.</p>
                </div>
                <span className={`status-pill customer-node-status customer-node-${customerNodeState.key}`}>{customerNodeState.label}</span>
              </div>

              <div className="section-grid portal-service-summary-grid">
                <article className="card dashboard-summary-card">
                  <div className="badge card-badge">Current Plan</div>
                  <h2>{plan ? localizedField(plan as unknown as Record<string, unknown>, "name", locale) : "No plan assigned"}</h2>
                  {plan ? (
                    <>
                      {localizedField(plan as unknown as Record<string, unknown>, "description", locale) ? <p className="plan-description portal-plan-description">{localizedField(plan as unknown as Record<string, unknown>, "description", locale)}</p> : null}
                      <div className="dashboard-metrics">
                        {plan.speed_down_mbps !== null ? <span><strong>{plan.speed_down_mbps}</strong> Mbps down</span> : null}
                        {plan.speed_up_mbps !== null ? <span><strong>{plan.speed_up_mbps}</strong> Mbps up</span> : null}
                        {plan.monthly_quota_gb !== null ? <span><strong>{plan.monthly_quota_gb}</strong> GB quota</span> : null}
                        <span><strong>${plan.monthly_price_usd}</strong>/month</span>
                      </div>
                    </>
                  ) : <p className="empty-state">Centrum has not assigned a plan yet.</p>}
                  <div className="section-actions portal-inline-actions">
                    <ServiceCustomizationWizard
                      defaults={{ fullName: displayName, email: account.email ?? "", phone: profile?.phone ?? "", address: profile?.address ?? "", preferredPlanId: profile?.plan_id ?? null, location: savedLocation }}
                      triggerLabel="Help Me Customize My Service"
                      triggerClassName="btn btn-primary"
                    />
                  </div>
                </article>

                <article className="card dashboard-summary-card">
                  <div className="badge card-badge">Connection</div>
                  <h2>Live Service Status</h2>
                  <p className="dashboard-big-value"><span className={`status-pill customer-node-status customer-node-${customerNodeState.key}`}>{customerNodeState.label}</span></p>
                  <p className="field-note customer-node-message">{customerNodeState.message}</p>
                  <div className="dashboard-detail-list">
                    <span><strong>Node:</strong> {node?.name ?? "Not assigned"}</span>
                    <span><strong>Account:</strong> {formatStatus(serviceStatus)}</span>
                    {node?.latency_ms !== null && node?.latency_ms !== undefined ? <span><strong>Latency:</strong> {node.latency_ms} ms</span> : null}
                    <span><strong>Address:</strong> {profile?.address ?? "Not provided"}</span>
                    <span><strong>Activated:</strong> {formatDate(profile?.activation_date, locale)}</span>
                  </div>
                </article>
              </div>

              <article className="card portal-location-card">
                <div className="badge card-badge">Service Location</div>
                <h2>Saved installation location</h2>
                <p className="page-intro">Upload your home or service point once. Centrum managers and admins can then use it for technician visits, coverage checks, and account support.</p>
                <LocationCapture
                  value={locationDraft}
                  onChange={(nextLocation) => {
                    if (nextLocation) void saveServiceLocation(nextLocation);
                  }}
                  title="Your service location"
                  description="Tap Upload location, choose the correct point on Google Maps, then send it."
                  disabled={locationSaving}
                  allowClear={false}
                />
                {locationSaving ? <p className="field-note">Uploading your location...</p> : null}
                {locationError ? <p className="form-alert form-alert-error">{locationError}</p> : null}
                {locationMessage ? <p className="form-alert form-alert-success">{locationMessage}</p> : null}
                {savedLocation ? <div className="section-actions portal-location-actions"><button type="button" className="btn btn-secondary" disabled={locationSaving} onClick={() => void clearServiceLocation()}>Remove saved location</button></div> : null}
                <p className="field-note">Removing your saved account location does not erase a location you previously attached to an older technician or customization request.</p>
              </article>

              <div className="section-grid portal-two-col portal-service-request-grid">
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
                    {requestType === "technical_visit" ? (
                      <LocationCapture
                        value={requestLocation}
                        onChange={setRequestLocation}
                        title="Technician visit location"
                        description="Optional, but useful when the technician needs the exact building or installation point."
                        preset={savedLocation}
                        presetLabel="Use my saved service location"
                      />
                    ) : null}
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
                      <div
                        className={`portal-feed-item ${notificationDeepLink.highlightRequest === String(request.id) ? "notification-highlight" : ""}`}
                        id={`service-request-${request.id}`}
                        key={request.id}
                      >
                        <div className="portal-feed-heading">
                          <strong>#{request.id} · {requestTypeLabels[request.request_type] ?? formatStatus(request.request_type)}</strong>
                          <span className={`status-pill status-${request.status}`}>{requestStatusLabels[request.status] ?? formatStatus(request.status)}</span>
                        </div>
                        <p>{request.details}</p>
                        {request.location_latitude !== null && request.location_longitude !== null ? (
                          <span className="field-note">Location attached to this request ✓</span>
                        ) : null}
                        {request.admin_note ? <p className="field-note"><strong>Centrum:</strong> {request.admin_note}</p> : null}
                        <span>{formatDateTime(request.created_at, locale)}</span>
                      </div>
                    )) : <p className="empty-state">No service requests yet.</p>}
                  </div>
                </article>
              </div>

              <article className="card" style={{ marginTop: "1rem" }}>
                <div className="badge card-badge">Recommendations</div>
                <h2>Customization Requests</h2>
                <p className="page-intro">Requests submitted while signed in appear here so you can follow their status.</p>
                <div className="portal-feed compact-scroll-list">
                  {customizationRequests.length ? customizationRequests.map((request) => (
                    <div
                      className={`portal-feed-item ${notificationDeepLink.highlightCustomization === String(request.id) ? "notification-highlight" : ""}`}
                      id={`customization-request-${request.id}`}
                      key={request.id}
                    >
                      <div className="portal-feed-heading">
                        <strong>#{request.id} · {request.preferred_plan_name || "Service recommendation"}</strong>
                        <span className={`status-pill status-${request.status}`}>{formatStatus(request.status)}</span>
                      </div>
                      <span>{formatDateTime(request.created_at, locale)}</span>
                    </div>
                  )) : <p className="empty-state">No signed-in customization requests yet.</p>}
                </div>
              </article>
            </div>
          ) : null}

          {activeWorkspace === "billing" ? (
            <div className="portal-workspace">
              <div className="admin-workspace-heading portal-workspace-heading">
                <div>
                  <div className="badge card-badge">Billing</div>
                  <h2>Renewal & payments</h2>
                  <p className="page-intro">See your next renewal and recent payment records without digging through the rest of the portal.</p>
                </div>
                <span className={`status-pill ${renewalState.className}`}>{renewalState.label}</span>
              </div>

              <div className="section-grid portal-billing-summary-grid">
                <article className="card dashboard-summary-card">
                  <div className="badge card-badge">Next Renewal</div>
                  <h2>{formatDate(profile?.renewal_date, locale)}</h2>
                  <span className={`status-pill ${renewalState.className}`}>{renewalState.label}</span>
                  {plan ? <p className="field-note">Expected plan charge: ${plan.monthly_price_usd}</p> : null}
                </article>

                <article className="card dashboard-summary-card">
                  <div className="badge card-badge">Last Payment</div>
                  <h2>{latestPayment ? `$${Number(latestPayment.amount_usd).toFixed(2)}` : "No payment yet"}</h2>
                  {latestPayment ? (
                    <div className="dashboard-detail-list">
                      <span>{formatDateTime(latestPayment.paid_at, locale)}</span>
                      <span>{formatStatus(latestPayment.payment_method)}</span>
                      {latestPayment.reference ? <span>Ref: {latestPayment.reference}</span> : null}
                    </div>
                  ) : <p className="empty-state">No payment has been recorded yet.</p>}
                </article>
              </div>

              <article className="card">
                <div className="section-heading-row">
                  <div>
                    <div className="badge card-badge">Billing History</div>
                    <h2>Recent Payments</h2>
                  </div>
                  <span className="status-pill status-active">{formatLoadedCount(payments.length, locale)}</span>
                </div>
                <div className="portal-payment-list compact-scroll-list portal-payment-list-redesigned">
                  {payments.length ? payments.map((payment) => (
                    <div className="portal-payment-row" key={payment.id}>
                      <div><strong>${Number(payment.amount_usd).toFixed(2)}</strong><span>{formatDateTime(payment.paid_at, locale)}</span></div>
                      <div><span>{formatStatus(payment.payment_method)}</span>{payment.reference ? <code>{payment.reference}</code> : null}</div>
                    </div>
                  )) : <p className="empty-state">No payment records yet.</p>}
                </div>
              </article>
            </div>
          ) : null}

          {activeWorkspace === "support" ? (
            <div className="portal-workspace">
              <div className="admin-workspace-heading portal-workspace-heading">
                <div>
                  <div className="badge card-badge">Support</div>
                  <h2>Tickets & updates</h2>
                  <p className="page-intro">Open a ticket, jump into live chat, or catch up on Centrum notices.</p>
                </div>
                <div className="section-actions portal-workspace-heading-actions">
                  <Link href="/portal/tickets/new" className="btn btn-primary">Create Ticket</Link>
                  <Link href="/portal/live-chat" className="btn btn-secondary">Live Chat</Link>
                </div>
              </div>

              <div className="section-grid portal-two-col">
                <article className="card">
                  <div className="section-heading-row">
                    <div>
                      <div className="badge card-badge">Communication</div>
                      <h2>Active Tickets</h2>
                    </div>
                    <span className="status-pill status-active">{formatActiveCount(tickets.length, locale)}</span>
                  </div>
                  <ul className="simple-list compact-scroll-list portal-ticket-list">
                    {tickets.length ? tickets.map((ticket) => (
                      <li key={ticket.id}>
                        <Link href={`/portal/tickets/${ticket.id}`} className="ticket-row">
                          <span><strong>#{ticket.id}</strong> · {ticket.subject}</span>
                          <span className={`status-pill status-${ticket.status}`}>{statusLabelMap[ticket.status] ?? ticket.status}</span>
                        </Link>
                      </li>
                    )) : <li className="empty-state">No active tickets.</li>}
                  </ul>
                </article>

                <article className="card">
                  <div className="badge card-badge">Notices</div>
                  <h2>Announcements</h2>
                  <div className="portal-feed compact-scroll-list">
                    {announcements.length ? announcements.map((announcement) => (
                      <div
                        className={`portal-feed-item ${notificationDeepLink.highlightAnnouncement === String(announcement.id) ? "notification-highlight" : ""}`}
                        id={`announcement-${announcement.id}`}
                        key={announcement.id}
                      >
                        <strong>{localizedField(announcement as unknown as Record<string, unknown>, "title", locale)}</strong>
                        <p>{localizedField(announcement as unknown as Record<string, unknown>, "body", locale)}</p>
                        <span>{formatDateTime(announcement.created_at, locale)}</span>
                      </div>
                    )) : <p className="empty-state">No current announcements.</p>}
                  </div>
                </article>
              </div>
            </div>
          ) : null}

          {activeWorkspace === "account" ? (
            <div className="portal-workspace">
              <div className="admin-workspace-heading portal-workspace-heading">
                <div>
                  <div className="badge card-badge">Account</div>
                  <h2>Profile & settings</h2>
                  <p className="page-intro">Review your account details and open the dedicated Account Settings page for password-sensitive or destructive actions.</p>
                </div>
                <Link href="/portal/account" className="btn btn-primary">Account Settings</Link>
              </div>

              <div className="section-grid portal-account-grid">
                <article className="card">
                  <div className="badge card-badge">Profile</div>
                  <h2>{displayName}</h2>
                  <div className="dashboard-detail-list portal-account-detail-list">
                    <span><strong>Email:</strong> {account.email ?? "Not available"}</span>
                    <span><strong>Phone:</strong> {profile?.phone ?? "Not provided"}</span>
                    <span><strong>Address:</strong> {profile?.address ?? "Not provided"}</span>
                    <span><strong>Service status:</strong> {formatStatus(serviceStatus)}</span>
                    <span><strong>Activated:</strong> {formatDate(profile?.activation_date, locale)}</span>
                  </div>
                </article>

                <article className="card portal-account-settings-card">
                  <div className="badge card-badge">Account Controls</div>
                  <h2>Account Settings</h2>
                  <p>Manage sensitive account actions from the dedicated settings page, including permanent portal-account deletion.</p>
                  <div className="section-actions">
                    <Link href="/portal/account" className="btn btn-primary">Open Account Settings</Link>
                  </div>
                  <p className="field-note">Deleting the portal account does not automatically cancel physical internet service or equipment agreements.</p>
                </article>
              </div>

              <article className="card portal-signout-card">
                <div>
                  <div className="badge card-badge">Session</div>
                  <h2>Signed in as {account.email ?? displayName}</h2>
                  <p className="page-intro">Finished managing your account? Sign out of this browser session.</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
              </article>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function toCapturedLocation(row: DbCustomerLocation | null): CapturedLocation | null {
  if (!row || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracy_m,
    capturedAt: row.captured_at,
  };
}

function readFullName(account: User) {
  const metadataFullName = account.user_metadata?.full_name;
  if (typeof metadataFullName === "string" && metadataFullName.trim()) return metadataFullName;
  const fallbackName = (account.email ?? "Customer").split("@")[0] ?? "Customer";
  return fallbackName.split(/[._-]/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function formatPlanSpeedSummary(plan: DbPlan) {
  const parts = [
    plan.speed_down_mbps !== null ? `${plan.speed_down_mbps} Mbps down` : null,
    plan.speed_up_mbps !== null ? `${plan.speed_up_mbps} Mbps up` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : (plan.description || "Plan details are managed by Centrum.");
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return locale === "fr" ? "Non défini" : locale === "ar" ? "غير محدد" : "Not set";
  return new Intl.DateTimeFormat(localizedDateLocale(locale), { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(localizedDateLocale(locale), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatWelcomeBack(displayName: string, locale: Locale) {
  if (locale === "fr") return `Bon retour, ${displayName}. Votre service, facturation, assistance et paramètres de compte sont maintenant organisés dans des espaces dédiés.`;
  if (locale === "ar") return `مرحبًا بعودتك، ${displayName}. أصبحت خدمتك وفوترة حسابك ودعمك وإعداداتك موزعة الآن ضمن أقسام واضحة.`;
  return `Welcome back, ${displayName}. Your service, billing, support, and account settings now live in focused workspaces.`;
}

function formatActiveTicketCount(count: number, locale: Locale) {
  if (locale === "fr") return `${count} ticket${count === 1 ? "" : "s"} actif${count === 1 ? "" : "s"}`;
  if (locale === "ar") return `${count} تذكرة نشطة`;
  return `${count} active ticket${count === 1 ? "" : "s"}`;
}

function formatRecentNoticeCount(count: number, locale: Locale) {
  if (locale === "fr") return `${count} avis récent${count === 1 ? "" : "s"}`;
  if (locale === "ar") return `${count} إشعار حديث`;
  return `${count} recent notice${count === 1 ? "" : "s"}`;
}

function formatLoadedCount(count: number, locale: Locale) {
  if (locale === "fr") return `${count} chargé${count === 1 ? "" : "s"}`;
  if (locale === "ar") return `${count} محمّلة`;
  return `${count} loaded`;
}

function formatActiveCount(count: number, locale: Locale) {
  if (locale === "fr") return `${count} actif${count === 1 ? "" : "s"}`;
  if (locale === "ar") return `${count} نشطة`;
  return `${count} active`;
}
