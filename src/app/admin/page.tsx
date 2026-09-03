"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import {
  deriveGlobalNetworkSummary,
  formatRelativeTime,
  heartbeatIsFresh,
  settingIsEnabled,
  statusSlug,
  type ProbeStatus,
} from "@/lib/network-monitoring";
import { AsyncState } from "@/components/AsyncState";
import { CentrumLoadingScreen } from "@/components/CentrumLoading";
import { MonitorAgentsPanel } from "@/components/MonitorAgentsPanel";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import { locationMapUrl } from "@/components/LocationCapture";

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
  renewal_auto_advance: boolean;
  renewal_interval_value: number;
  renewal_interval_unit: "week" | "month" | "year";
};

type DbCustomerLocation = {
  customer_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  captured_at: string;
  updated_at: string;
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
  monthly_quota_gb: number | null;
  monthly_price_usd: number;
  is_active: boolean;
};

type DbNode = {
  id: string;
  name: string;
  monitor_ip: string | null;
  monitor_enabled: boolean;
  probe_status: ProbeStatus;
  latency_ms: number | null;
  last_checked_at: string | null;
  last_seen_at: string | null;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  updated_at: string | null;
};

type DbTicket = {
  id: number;
  subject: string;
  status: string;
  created_at: string;
};

type CoverageRegion = {
  id: number;
  name: string;
  name_fr: string | null;
  name_ar: string | null;
  description: string | null;
  description_fr: string | null;
  description_ar: string | null;
  is_active: boolean;
  sort_order: number;
};

type ContactInquiry = {
  id: number;
  customer_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: "new" | "in_progress" | "resolved" | "spam";
  created_at: string;
};

type ProfileDraft = {
  full_name: string;
  phone: string;
  address: string;
  node_id: string;
  plan_id: string;
  service_status: string;
  activation_date: string;
  renewal_date: string;
  renewal_auto_advance: boolean;
  renewal_interval_value: string;
  renewal_interval_unit: "week" | "month" | "year";
};

type PlanForm = {
  name: string;
  name_fr: string;
  name_ar: string;
  description: string;
  description_fr: string;
  description_ar: string;
  speed_down_mbps: string;
  speed_up_mbps: string;
  monthly_quota_gb: string;
  monthly_price_usd: string;
};

const emptyPlanForm: PlanForm = {
  name: "",
  name_fr: "",
  name_ar: "",
  description: "",
  description_fr: "",
  description_ar: "",
  speed_down_mbps: "",
  speed_up_mbps: "",
  monthly_quota_gb: "",
  monthly_price_usd: "",
};

const PAGE_SIZE = 10;
const contactStatuses = ["new", "in_progress", "resolved", "spam"] as const;

type AdminWorkspace = "overview" | "customers" | "network" | "support" | "catalog";

export default function AdminPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [storedNetworkStatus, setStoredNetworkStatus] = useState("Monitoring Pending");
  const [globalMaintenance, setGlobalMaintenance] = useState(false);
  const [monitorHeartbeat, setMonitorHeartbeat] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [users, setUsers] = useState<DbProfile[]>([]);
  const [customerLocations, setCustomerLocations] = useState<DbCustomerLocation[]>([]);
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [nodes, setNodes] = useState<DbNode[]>([]);
  const [tickets, setTickets] = useState<DbTicket[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [userPlanFilter, setUserPlanFilter] = useState("all");
  const [userNodeFilter, setUserNodeFilter] = useState("all");
  const [userSort, setUserSort] = useState("name_az");
  const [userPage, setUserPage] = useState(1);
  const [userDrafts, setUserDrafts] = useState<Record<string, ProfileDraft>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [userError, setUserError] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeIp, setNewNodeIp] = useState("");
  const [savingNodeId, setSavingNodeId] = useState<string | null>(null);
  const [nodeMessage, setNodeMessage] = useState("");
  const [nodeError, setNodeError] = useState("");
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeStatusFilter, setNodeStatusFilter] = useState("all");
  const [nodeSort, setNodeSort] = useState("name_az");
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const [planError, setPlanError] = useState("");
  const [contactInquiries, setContactInquiries] = useState<ContactInquiry[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState("all");
  const [contactSort, setContactSort] = useState("newest");
  const [contactPage, setContactPage] = useState(1);
  const [contactError, setContactError] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [updatingContactId, setUpdatingContactId] = useState<number | null>(null);
  const [coverageRegions, setCoverageRegions] = useState<CoverageRegion[]>([]);
  const [newRegionName, setNewRegionName] = useState("");
  const [newRegionNameFr, setNewRegionNameFr] = useState("");
  const [newRegionNameAr, setNewRegionNameAr] = useState("");
  const [newRegionDescription, setNewRegionDescription] = useState("");
  const [newRegionDescriptionFr, setNewRegionDescriptionFr] = useState("");
  const [newRegionDescriptionAr, setNewRegionDescriptionAr] = useState("");
  const [coverageMessage, setCoverageMessage] = useState("");
  const [coverageError, setCoverageError] = useState("");
  const [savingRegionId, setSavingRegionId] = useState<number | null>(null);
  const [coverageSearch, setCoverageSearch] = useState("");
  const [coverageVisibilityFilter, setCoverageVisibilityFilter] = useState("all");
  const [coverageSort, setCoverageSort] = useState("order");
  const [planSearch, setPlanSearch] = useState("");
  const [planStatusFilter, setPlanStatusFilter] = useState("all");
  const [planSort, setPlanSort] = useState("price_low");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [ticketSort, setTicketSort] = useState("newest");
  const [ticketError, setTicketError] = useState("");
  const [activeWorkspace, setActiveWorkspace] = useState<AdminWorkspace>("overview");

  const fetchMonitoringSettings = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("system_settings")
      .select("key,value")
      .in("key", ["network_status", "global_maintenance", "monitor_heartbeat_at"]);

    if (error) {
      console.error("Admin network settings load failed", error);
      setNodeError(toFriendlyErrorMessage(error, "Network settings could not be loaded right now."));
      return;
    }

    const settings = new Map((data ?? []).map((row) => [row.key, row.value]));
    setStoredNetworkStatus(settings.get("network_status") ?? "Monitoring Pending");
    setGlobalMaintenance(settingIsEnabled(settings.get("global_maintenance")));
    setMonitorHeartbeat(settings.get("monitor_heartbeat_at") ?? null);
  }, [supabase]);

  const fetchPlans = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("plans")
      .select("id,name,name_fr,name_ar,description,description_fr,description_ar,speed_down_mbps,speed_up_mbps,monthly_quota_gb,monthly_price_usd,is_active")
      .order("monthly_price_usd", { ascending: true });
    if (error) { console.error("Admin plans load failed", error); setPlanError(toFriendlyErrorMessage(error, "Plans could not be loaded right now.")); }
    else { setPlanError(""); setPlans((data as DbPlan[] | null) ?? []); }
  }, [supabase]);

  const fetchNodes = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("nodes")
      .select("id,name,monitor_ip,monitor_enabled,probe_status,latency_ms,last_checked_at,last_seen_at,maintenance_mode,maintenance_message,updated_at")
      .order("name", { ascending: true });
    if (error) { console.error("Admin nodes load failed", error); setNodeError(toFriendlyErrorMessage(error, "Service nodes could not be loaded right now.")); }
    else { setNodeError(""); setNodes((data as DbNode[] | null) ?? []); }
  }, [supabase]);

  const fetchUsers = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,phone,address,node_id,plan_id,service_status,activation_date,renewal_date,renewal_auto_advance,renewal_interval_value,renewal_interval_unit")
      .eq("role", "customer")
      .order("full_name", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("Admin customers load failed", error);
      setUserError(toFriendlyErrorMessage(error, "Customers could not be loaded right now."));
      return;
    }
    setUserError("");
    setUsers((data as DbProfile[] | null) ?? []);
  }, [supabase]);

  const fetchCustomerLocations = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("customer_locations")
      .select("customer_id,latitude,longitude,accuracy_m,captured_at,updated_at");
    if (error) {
      console.error("Admin customer locations load failed", error);
      setUserError((current) => current || toFriendlyErrorMessage(error, "Saved customer locations could not be loaded right now."));
      return;
    }
    setCustomerLocations((data as DbCustomerLocation[] | null) ?? []);
  }, [supabase]);

  const fetchTickets = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("tickets").select("id,subject,status,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) {
      console.error("Admin tickets load failed", error);
      setTicketError(toFriendlyErrorMessage(error, "Tickets could not be loaded right now."));
      return;
    }
    setTicketError("");
    setTickets((data as DbTicket[] | null) ?? []);
  }, [supabase]);

  const fetchCoverageRegions = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("coverage_regions")
      .select("id,name,name_fr,name_ar,description,description_fr,description_ar,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) { console.error("Admin coverage load failed", error); setCoverageError(toFriendlyErrorMessage(error, "Coverage regions could not be loaded right now.")); }
    else { setCoverageError(""); setCoverageRegions((data as CoverageRegion[] | null) ?? []); }
  }, [supabase]);

  const fetchContactInquiries = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("contact_inquiries")
      .select("id,customer_id,name,email,phone,subject,message,status,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("Admin contact inbox load failed", error);
      setContactError(toFriendlyErrorMessage(error, "Contact messages could not be loaded right now."));
      return;
    }
    setContactError("");
    setContactInquiries((data as ContactInquiry[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    async function boot() {
      const { data, error } = await supabase!.auth.getUser();
      if (!mounted) return;
      if (error || !data.user) {
        setIsLoading(false);
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
      await Promise.all([fetchMonitoringSettings(), fetchPlans(), fetchNodes(), fetchUsers(), fetchCustomerLocations(), fetchTickets(), fetchContactInquiries(), fetchCoverageRegions()]);
      if (mounted) setIsLoading(false);
    }

    void boot();
    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (!session?.user) {
        router.replace("/portal/login");
        return;
      }
      const admin = await resolveIsAdmin(supabase!, session.user);
      if (!mounted) return;
      if (!admin) router.replace("/portal/dashboard");
      else setAccount(session.user);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase, fetchMonitoringSettings, fetchPlans, fetchNodes, fetchUsers, fetchCustomerLocations, fetchTickets, fetchContactInquiries, fetchCoverageRegions]);

  useEffect(() => {
    if (!supabase || !account) return;

    const refresh = () => {
      void fetchMonitoringSettings();
      void fetchNodes();
    };
    const interval = window.setInterval(refresh, 10_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [account, fetchMonitoringSettings, fetchNodes, supabase]);

  const networkSummary = useMemo(
    () => deriveGlobalNetworkSummary(nodes, globalMaintenance, monitorHeartbeat),
    [nodes, globalMaintenance, monitorHeartbeat],
  );

  const visibleNodes = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase();
    return [...nodes].filter((node) => {
      const matchesSearch = !query || [node.name, node.monitor_ip ?? ""].some((value) => value.toLowerCase().includes(query));
      const fresh = heartbeatIsFresh(node.last_checked_at);
      const status = !node.monitor_enabled ? "disabled" : node.maintenance_mode ? "maintenance" : !node.last_checked_at || !fresh ? "unknown" : node.probe_status;
      return matchesSearch && (nodeStatusFilter === "all" || status === nodeStatusFilter);
    }).sort((a, b) => {
      if (nodeSort === "status") return String(a.probe_status).localeCompare(String(b.probe_status)) || a.name.localeCompare(b.name);
      if (nodeSort === "last_seen") return new Date(b.last_seen_at ?? 0).getTime() - new Date(a.last_seen_at ?? 0).getTime();
      if (nodeSort === "customers") {
        const aCount = users.filter((user) => user.node_id === a.id).length;
        const bCount = users.filter((user) => user.node_id === b.id).length;
        return bCount - aCount || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [nodes, nodeSearch, nodeStatusFilter, nodeSort, users]);

  const visibleCoverageRegions = useMemo(() => {
    const query = coverageSearch.trim().toLowerCase();
    return [...coverageRegions].filter((region) => {
      const matchesSearch = !query || [region.name, region.description ?? ""].some((value) => value.toLowerCase().includes(query));
      const matchesVisibility = coverageVisibilityFilter === "all" || (coverageVisibilityFilter === "public" ? region.is_active : !region.is_active);
      return matchesSearch && matchesVisibility;
    }).sort((a, b) => coverageSort === "name" ? a.name.localeCompare(b.name) : a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [coverageRegions, coverageSearch, coverageVisibilityFilter, coverageSort]);

  const visiblePlans = useMemo(() => {
    const query = planSearch.trim().toLowerCase();
    return [...plans].filter((plan) => {
      const matchesSearch = !query
        || plan.name.toLowerCase().includes(query)
        || (plan.name_fr ?? "").toLowerCase().includes(query)
        || (plan.name_ar ?? "").toLowerCase().includes(query)
        || (plan.description ?? "").toLowerCase().includes(query)
        || (plan.description_fr ?? "").toLowerCase().includes(query)
        || (plan.description_ar ?? "").toLowerCase().includes(query)
        || (plan.speed_down_mbps !== null && String(plan.speed_down_mbps).includes(query))
        || (plan.speed_up_mbps !== null && String(plan.speed_up_mbps).includes(query))
        || String(plan.monthly_price_usd).includes(query);
      const matchesStatus = planStatusFilter === "all" || (planStatusFilter === "active" ? plan.is_active : !plan.is_active);
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (planSort === "name") return a.name.localeCompare(b.name);
      if (planSort === "speed_high") return (b.speed_down_mbps ?? -1) - (a.speed_down_mbps ?? -1);
      if (planSort === "price_high") return b.monthly_price_usd - a.monthly_price_usd;
      return a.monthly_price_usd - b.monthly_price_usd;
    });
  }, [plans, planSearch, planStatusFilter, planSort]);

  const visibleTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase();
    return [...tickets].filter((ticket) => {
      const matchesSearch = !query || ticket.subject.toLowerCase().includes(query) || String(ticket.id).includes(query);
      return matchesSearch && (ticketStatusFilter === "all" || ticket.status === ticketStatusFilter);
    }).sort((a, b) => ticketSort === "oldest" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [tickets, ticketSearch, ticketStatusFilter, ticketSort]);

  const customerLocationMap = useMemo(() => new Map(customerLocations.map((location) => [location.customer_id, location])), [customerLocations]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      const planName = plans.find((plan) => plan.id === user.plan_id)?.name ?? null;
      const nodeName = nodes.find((node) => node.id === user.node_id)?.name ?? null;
      const matchesSearch = !q || [user.full_name, user.phone, user.address, planName, nodeName]
        .some((value) => value?.toLowerCase().includes(q));
      const matchesStatus = userStatusFilter === "all" || user.service_status === userStatusFilter;
      const matchesPlan = userPlanFilter === "all" || String(user.plan_id ?? "none") === userPlanFilter;
      const matchesNode = userNodeFilter === "all" || String(user.node_id ?? "none") === userNodeFilter;
      return matchesSearch && matchesStatus && matchesPlan && matchesNode;
    }).sort((a, b) => {
      if (userSort === "status") return a.service_status.localeCompare(b.service_status) || (a.full_name ?? "").localeCompare(b.full_name ?? "");
      if (userSort === "renewal") return String(a.renewal_date ?? "9999-12-31").localeCompare(String(b.renewal_date ?? "9999-12-31"));
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
  }, [users, userSearch, userStatusFilter, userPlanFilter, userNodeFilter, userSort, plans, nodes]);

  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = useMemo(() => {
    const safePage = Math.min(userPage, userPageCount);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, userPage, userPageCount]);

  const filteredContactInquiries = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contactInquiries.filter((inquiry) => {
      const matchesStatus = contactStatusFilter === "all" || inquiry.status === contactStatusFilter;
      const matchesSearch = !q || [inquiry.name, inquiry.email, inquiry.phone, inquiry.subject, inquiry.message]
        .some((value) => value?.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    }).sort((a, b) => contactSort === "oldest" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [contactInquiries, contactSearch, contactStatusFilter, contactSort]);

  const contactPageCount = Math.max(1, Math.ceil(filteredContactInquiries.length / PAGE_SIZE));
  const pagedContactInquiries = useMemo(() => {
    const safePage = Math.min(contactPage, contactPageCount);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredContactInquiries.slice(start, start + PAGE_SIZE);
  }, [filteredContactInquiries, contactPage, contactPageCount]);

  useEffect(() => {
    setUserPage(1);
    setSelectedUserId(null);
  }, [userSearch, userStatusFilter, userPlanFilter, userNodeFilter, userSort]);

  useEffect(() => {
    setContactPage(1);
  }, [contactSearch, contactStatusFilter, contactSort]);

  useEffect(() => {
    if (userPage > userPageCount) setUserPage(userPageCount);
  }, [userPage, userPageCount]);

  useEffect(() => {
    if (contactPage > contactPageCount) setContactPage(contactPageCount);
  }, [contactPage, contactPageCount]);

  const activeCustomerCount = users.filter((user) => user.service_status === "active").length;
  const activePlanCount = plans.filter((plan) => plan.is_active).length;
  const activeCoverageCount = coverageRegions.filter((region) => region.is_active).length;
  const openTicketCount = tickets.filter((ticket) => ticket.status !== "resolved").length;
  const newMessageCount = contactInquiries.filter((item) => item.status === "new").length;
  const supportAttentionCount = openTicketCount + newMessageCount;

  const activeWorkspaceError =
    activeWorkspace === "customers" ? userError
      : activeWorkspace === "network" ? (nodeError || coverageError)
        : activeWorkspace === "support" ? (contactError || ticketError)
          : activeWorkspace === "catalog" ? planError
            : (userError || nodeError || planError || contactError || coverageError || ticketError);

  async function retryActiveWorkspace() {
    if (activeWorkspace === "customers") {
      await Promise.all([fetchUsers(), fetchCustomerLocations(), fetchPlans(), fetchNodes()]);
      return;
    }

    if (activeWorkspace === "network") {
      await Promise.all([fetchMonitoringSettings(), fetchNodes(), fetchCoverageRegions(), fetchUsers()]);
      return;
    }

    if (activeWorkspace === "support") {
      await Promise.all([fetchTickets(), fetchContactInquiries()]);
      return;
    }

    if (activeWorkspace === "catalog") {
      await fetchPlans();
      return;
    }

    await Promise.all([
      fetchMonitoringSettings(),
      fetchPlans(),
      fetchNodes(),
      fetchUsers(),
      fetchCustomerLocations(),
      fetchTickets(),
      fetchContactInquiries(),
      fetchCoverageRegions(),
    ]);
  }

  function openWorkspace(workspace: AdminWorkspace) {
    setActiveWorkspace(workspace);
    setSelectedUserId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function draftFor(user: DbProfile): ProfileDraft {
    return userDrafts[user.id] ?? {
      full_name: user.full_name ?? "",
      phone: user.phone ?? "",
      address: user.address ?? "",
      node_id: user.node_id ?? "",
      plan_id: user.plan_id ? String(user.plan_id) : "",
      service_status: user.service_status ?? "active",
      activation_date: user.activation_date ?? "",
      renewal_date: user.renewal_date ?? "",
      renewal_auto_advance: user.renewal_auto_advance ?? false,
      renewal_interval_value: String(user.renewal_interval_value ?? 1),
      renewal_interval_unit: user.renewal_interval_unit ?? "month",
    };
  }

  function updateDraft(user: DbProfile, patch: Partial<ProfileDraft>) {
    setUserDrafts((current) => ({ ...current, [user.id]: { ...draftFor(user), ...patch } }));
  }

  async function saveUser(user: DbProfile) {
    if (!supabase) return;
    const draft = draftFor(user);
    setSavingUserId(user.id);
    setUserError("");
    setUserMessage("");

    const chosenPlan = plans.find((plan) => String(plan.id) === draft.plan_id) ?? null;
    const parsedRenewalInterval = Number.parseInt(draft.renewal_interval_value, 10);
    const renewalIntervalValue =
      Number.isFinite(parsedRenewalInterval) && parsedRenewalInterval > 0
        ? Math.min(parsedRenewalInterval, 52)
        : 1;
    const payload = {
      full_name: draft.full_name.trim() || user.full_name || "Customer",
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      node_id: draft.node_id || null,
      plan_id: chosenPlan?.id ?? null,
      service_status: draft.service_status || "active",
      activation_date: draft.activation_date || null,
      renewal_date: draft.renewal_date || null,
      renewal_auto_advance: draft.renewal_auto_advance,
      renewal_interval_value: renewalIntervalValue,
      renewal_interval_unit: draft.renewal_interval_unit,
    };

    const { error } = await supabase!.from("profiles").update(payload).eq("id", user.id);
    if (error) {
      setUserError(toFriendlyErrorMessage(error, "The customer update could not be saved. Please try again."));
      setSavingUserId(null);
      return;
    }

    setUsers((current) => current.map((item) => item.id === user.id ? {
      ...item,
      full_name: payload.full_name,
      phone: payload.phone,
      address: payload.address,
      node_id: payload.node_id,
      plan_id: payload.plan_id,
      service_status: payload.service_status,
      activation_date: payload.activation_date,
      renewal_date: payload.renewal_date,
      renewal_auto_advance: payload.renewal_auto_advance,
      renewal_interval_value: payload.renewal_interval_value,
      renewal_interval_unit: payload.renewal_interval_unit,
    } : item));
    setSelectedUserId(null);
    setUserMessage(`${payload.full_name} was updated.`);
    setSavingUserId(null);
  }

  async function deleteCustomerAccount(user: DbProfile) {
    if (!supabase || deletingUserId) return;

    const label = user.full_name || `customer ${user.id.slice(0, 8)}`;
    if (!window.confirm(`Permanently delete ${label}'s Centrum account? This removes their sign-in and customer-owned portal records. Retained accounting history may remain without the account link. This cannot be undone.`)) return;

    const typed = window.prompt('Type DELETE CUSTOMER to confirm permanent account deletion.');
    if (typed !== 'DELETE CUSTOMER') {
      if (typed !== null) setUserError('Customer deletion cancelled because the confirmation phrase did not match.');
      return;
    }

    setDeletingUserId(user.id);
    setUserError('');
    setUserMessage('');

    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: {
        action: 'admin_delete_customer',
        target_user_id: user.id,
        confirmation: 'DELETE CUSTOMER',
      },
    });

    if (error || !data?.ok) {
      let failureMessage = typeof data?.error === 'string' ? data.error : 'The customer account could not be deleted.';
      const context = (error as { context?: Response } | null)?.context;
      if (context) {
        try {
          const payload = await context.clone().json() as { error?: unknown };
          if (typeof payload.error === 'string' && payload.error.trim()) failureMessage = payload.error;
        } catch {
          // Keep the safe fallback message when the function response is not JSON.
        }
      }
      setUserError(failureMessage);
      setDeletingUserId(null);
      return;
    }

    setUsers((current) => current.filter((item) => item.id !== user.id));
    setSelectedUserId(null);
    setUserDrafts((current) => {
      const next = { ...current };
      delete next[user.id];
      return next;
    });
    setUserMessage(`${label} was permanently deleted.`);
    setDeletingUserId(null);
  }

  async function updateContactStatus(id: number, status: ContactInquiry["status"]) {
    if (!supabase) return;
    setUpdatingContactId(id);
    setContactError("");
    setContactMessage("");
    const { error } = await supabase
      .from("contact_inquiries")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setContactError(toFriendlyErrorMessage(error, "The contact message could not be updated. Please try again."));
    } else {
      setContactInquiries((current) => current.map((item) => item.id === id ? { ...item, status } : item));
      setContactMessage("Contact message updated.");
    }
    setUpdatingContactId(null);
  }

  async function deleteContactInquiry(inquiry: ContactInquiry) {
    if (!supabase || !window.confirm(`Delete the message from ${inquiry.name}?`)) return;
    setUpdatingContactId(inquiry.id);
    setContactError("");
    const { error } = await supabase.from("contact_inquiries").delete().eq("id", inquiry.id);
    if (error) setContactError(toFriendlyErrorMessage(error, "The contact message could not be updated. Please try again."));
    else setContactInquiries((current) => current.filter((item) => item.id !== inquiry.id));
    setUpdatingContactId(null);
  }

  async function addCoverageRegion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const name = newRegionName.trim();
    if (!name) return;
    setCoverageError("");
    setCoverageMessage("");
    const nextSort = coverageRegions.length ? Math.max(...coverageRegions.map((region) => region.sort_order)) + 10 : 10;
    const { error } = await supabase.from("coverage_regions").insert({
      name,
      name_fr: newRegionNameFr.trim() || null,
      name_ar: newRegionNameAr.trim() || null,
      description: newRegionDescription.trim() || null,
      description_fr: newRegionDescriptionFr.trim() || null,
      description_ar: newRegionDescriptionAr.trim() || null,
      is_active: true,
      sort_order: nextSort,
    });
    if (error) {
      setCoverageError(error.message.includes("duplicate") ? "That coverage region already exists." : toFriendlyErrorMessage(error, "The coverage region could not be added. Please try again."));
      return;
    }
    setNewRegionName("");
    setNewRegionNameFr("");
    setNewRegionNameAr("");
    setNewRegionDescription("");
    setNewRegionDescriptionFr("");
    setNewRegionDescriptionAr("");
    setCoverageMessage(`“${name}” is now listed as an active coverage region.`);
    await fetchCoverageRegions();
  }

  async function updateCoverageRegion(region: CoverageRegion, patch: Partial<CoverageRegion>) {
    if (!supabase) return;
    setSavingRegionId(region.id);
    setCoverageError("");
    setCoverageMessage("");
    const { error } = await supabase.from("coverage_regions").update(patch).eq("id", region.id);
    if (error) setCoverageError(toFriendlyErrorMessage(error, "The coverage region could not be changed. Please try again."));
    else {
      setCoverageMessage("Coverage region updated. Public coverage pages will reflect the change automatically.");
      await fetchCoverageRegions();
    }
    setSavingRegionId(null);
  }

  async function deleteCoverageRegion(region: CoverageRegion) {
    if (!supabase || !window.confirm(`Delete coverage region “${region.name}”?`)) return;
    setSavingRegionId(region.id);
    setCoverageError("");
    const { error } = await supabase.from("coverage_regions").delete().eq("id", region.id);
    if (error) setCoverageError(toFriendlyErrorMessage(error, "The coverage region could not be changed. Please try again."));
    else {
      setCoverageMessage(`“${region.name}” was removed from coverage.`);
      await fetchCoverageRegions();
    }
    setSavingRegionId(null);
  }

  async function addNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const name = newNodeName.trim();
    const monitorIp = newNodeIp.trim();
    if (!name || !monitorIp) {
      setNodeError("Enter both a node name and the IP that monitoring agents should ping.");
      return;
    }
    setNodeError("");
    setNodeMessage("");
    const { error } = await supabase.from("nodes").insert({
      name,
      monitor_ip: monitorIp,
      monitor_enabled: true,
      probe_status: "unknown",
      maintenance_mode: false,
    });
    if (error) {
      setNodeError(error.message.includes("duplicate") ? "That node name or monitoring IP already exists." : toFriendlyErrorMessage(error, "The service node could not be added. Please try again."));
      return;
    }
    setNewNodeName("");
    setNewNodeIp("");
    setNodeMessage(`Node “${name}” was saved. Assign it to one or more Monitoring Agents that can reach it.`);
    await fetchNodes();
  }

  async function updateNode(node: DbNode, patch: Partial<Pick<DbNode, "name" | "monitor_ip" | "monitor_enabled" | "maintenance_mode" | "maintenance_message">>) {
    if (!supabase) return;
    setSavingNodeId(node.id);
    setNodeError("");
    setNodeMessage("");
    const { error } = await supabase.from("nodes").update(patch).eq("id", node.id);
    if (error) setNodeError(toFriendlyErrorMessage(error, "The service node could not be changed. Please try again."));
    else {
      setNodeMessage(`“${patch.name ?? node.name}” was updated.`);
      await fetchNodes();
    }
    setSavingNodeId(null);
  }

  async function editNode(node: DbNode) {
    const name = window.prompt("Node name", node.name)?.trim();
    if (!name) return;
    const monitorIp = window.prompt("Monitoring IP", node.monitor_ip ?? "")?.trim();
    if (!monitorIp) return;
    await updateNode(node, { name, monitor_ip: monitorIp });
  }

  async function toggleNodeMaintenance(node: DbNode) {
    if (!supabase) return;
    let maintenanceMessage = node.maintenance_message;
    if (!node.maintenance_mode) {
      const message = window.prompt(
        "Optional message shown only to customers assigned to this node",
        node.maintenance_message ?? "Your service area is currently under maintenance.",
      );
      if (message === null) return;
      maintenanceMessage = message.trim() || null;
    }
    await updateNode(node, {
      maintenance_mode: !node.maintenance_mode,
      maintenance_message: maintenanceMessage,
    });
  }

  async function deleteNode(node: DbNode) {
    if (!supabase) return;
    const assignedCount = users.filter((user) => user.node_id === node.id).length;
    const warning = assignedCount
      ? ` ${assignedCount} customer${assignedCount === 1 ? " is" : "s are"} currently assigned to this node and will become unassigned.`
      : "";
    if (!window.confirm(`Remove “${node.name}” from the node list?${warning}`)) return;
    setNodeError("");
    setNodeMessage("");
    const { error } = await supabase.from("nodes").delete().eq("id", node.id);
    if (error) setNodeError(toFriendlyErrorMessage(error, "The service node could not be deleted. Please try again."));
    else {
      setNodeMessage(`“${node.name}” was removed.${assignedCount ? ` ${assignedCount} customer${assignedCount === 1 ? " is" : "s are"} now unassigned.` : ""}`);
      await Promise.all([fetchNodes(), fetchUsers()]);
    }
  }

  async function updateGlobalMaintenance(enabled: boolean) {
    if (!supabase || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setNodeError("");
    const nextSummary = deriveGlobalNetworkSummary(nodes, enabled, monitorHeartbeat);
    const { error } = await supabase.from("system_settings").upsert(
      [
        { key: "global_maintenance", value: enabled ? "true" : "false" },
        { key: "network_status", value: nextSummary.label },
      ],
      { onConflict: "key" },
    );
    if (error) setNodeError(toFriendlyErrorMessage(error, "The service node could not be changed. Please try again."));
    else {
      setGlobalMaintenance(enabled);
      setStoredNetworkStatus(nextSummary.label);
      setNodeMessage(enabled ? "Global maintenance mode is on for all customers." : "Global maintenance mode is off. Automatic monitoring is in control again.");
    }
    setIsUpdatingStatus(false);
  }

  function startEditingPlan(plan: DbPlan) {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name,
      name_fr: plan.name_fr ?? "",
      name_ar: plan.name_ar ?? "",
      description: plan.description ?? "",
      description_fr: plan.description_fr ?? "",
      description_ar: plan.description_ar ?? "",
      speed_down_mbps: plan.speed_down_mbps === null ? "" : String(plan.speed_down_mbps),
      speed_up_mbps: plan.speed_up_mbps === null ? "" : String(plan.speed_up_mbps),
      monthly_quota_gb: plan.monthly_quota_gb === null ? "" : String(plan.monthly_quota_gb),
      monthly_price_usd: String(plan.monthly_price_usd),
    });
    setPlanError("");
    setPlanMessage("");
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const name = planForm.name.trim();
    const nameFr = planForm.name_fr.trim();
    const nameAr = planForm.name_ar.trim();
    const description = planForm.description.trim();
    const descriptionFr = planForm.description_fr.trim();
    const descriptionAr = planForm.description_ar.trim();
    const down = planForm.speed_down_mbps.trim() ? Number(planForm.speed_down_mbps) : null;
    const up = planForm.speed_up_mbps.trim() ? Number(planForm.speed_up_mbps) : null;
    const quota = planForm.monthly_quota_gb.trim() ? Number(planForm.monthly_quota_gb) : null;
    const price = Number(planForm.monthly_price_usd);

    const invalidDown = down !== null && (!Number.isFinite(down) || down <= 0);
    const invalidUp = up !== null && (!Number.isFinite(up) || up <= 0);
    const invalidQuota = quota !== null && (!Number.isFinite(quota) || quota < 0);

    const invalidTranslatedDescription = [descriptionFr, descriptionAr].some((value) => value.length > 160 || /[\r\n]/.test(value));

    if (!name || !description || description.length > 160 || /[\r\n]/.test(description) || invalidTranslatedDescription || invalidDown || invalidUp || invalidQuota || !Number.isFinite(price) || price < 0) {
      setPlanError("Enter a plan name, a one-line description (160 characters max), a valid price, and valid optional speed/quota values.");
      return;
    }

    setIsSavingPlan(true);
    setPlanError("");
    const payload = {
      name,
      name_fr: nameFr || null,
      name_ar: nameAr || null,
      description,
      description_fr: descriptionFr || null,
      description_ar: descriptionAr || null,
      speed_down_mbps: down,
      speed_up_mbps: up,
      monthly_quota_gb: quota,
      monthly_price_usd: price,
      is_active: true,
    };
    const result = editingPlanId === null ? await supabase!.from("plans").insert(payload) : await supabase!.from("plans").update(payload).eq("id", editingPlanId);
    if (result.error) setPlanError(toFriendlyErrorMessage(result.error, "The plan could not be saved. Please try again."));
    else {
      setPlanMessage(editingPlanId === null ? "Plan added successfully." : "Plan updated successfully.");
      resetPlanForm();
      await fetchPlans();
    }
    setIsSavingPlan(false);
  }

  async function togglePlan(plan: DbPlan) {
    if (!supabase) return;
    const { error } = await supabase!.from("plans").update({ is_active: !plan.is_active }).eq("id", plan.id);
    if (error) setPlanError(toFriendlyErrorMessage(error, "The plan could not be changed. Please try again."));
    else await fetchPlans();
  }

  async function deletePlan(plan: DbPlan) {
    if (!supabase || !window.confirm(`Delete “${plan.name}” permanently?`)) return;
    const assigned = users.some((user) => user.plan_id === plan.id);
    if (assigned) {
      setPlanError("That plan is assigned to a customer. Change their plan first, then delete it.");
      return;
    }
    const { error } = await supabase!.from("plans").delete().eq("id", plan.id);
    if (error) setPlanError(toFriendlyErrorMessage(error, "The plan could not be changed. Please try again."));
    else await fetchPlans();
  }


  async function signOutAdmin() {
    if (!supabase || isSigningOut) return;

    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setUserError(toFriendlyErrorMessage(error, "Sign out failed. Please try again."));
      setIsSigningOut(false);
      return;
    }

    router.replace("/portal/login");
    router.refresh();
  }

  if (isLoading) return <CentrumLoadingScreen context="Admin Console" message="Checking your access and loading Centrum operations data." />;
  if (!supabase) return <section><h1>Admin Dashboard</h1><p className="page-intro">Supabase is not configured yet.</p></section>;
  if (!account) return <section><h1>Admin Dashboard</h1><p className="page-intro">Redirecting...</p></section>;

  return (
    <section className="animate-fade-in admin-page">
      <div className="admin-header admin-console-header">
        <div>
          <div className="badge badge-pulse page-badge">Privileged Access · Admin</div>
          <h1>Centrum Admin Console</h1>
          <p className="page-intro">Choose a workspace instead of scrolling through the entire operations center at once.</p>
        </div>
        <div className="admin-header-utilities">
          <button type="button" className="btn btn-danger" onClick={() => void signOutAdmin()} disabled={isSigningOut}>
            {isSigningOut ? "Signing Out..." : "Sign Out"}
          </button>
        </div>
      </div>

      <div className="mobile-console-navigation" aria-label="Admin mobile navigation">
        <label className="mobile-console-workspace">
          <span>Workspace</span>
          <select
            value={activeWorkspace}
            onChange={(event) => openWorkspace(event.target.value as AdminWorkspace)}
            aria-label="Choose admin workspace"
          >
            <option value="overview">Overview</option>
            <option value="customers">Customers ({users.length})</option>
            <option value="network">Network ({networkSummary.downCount} down)</option>
            <option value="support">Support ({supportAttentionCount})</option>
            <option value="catalog">Service Catalog ({activePlanCount})</option>
          </select>
        </label>

        <details className="mobile-console-tools">
          <summary>Tools</summary>
          <div className="mobile-console-tools-menu">
            <Link href="/admin/live-chat" className="mobile-console-tool-link"><strong>Live Chat Inbox</strong><small>Customer conversations</small></Link>
            <Link href="/admin/operations" className="mobile-console-tool-link"><strong>Customer Operations</strong><small>Payments & service requests</small></Link>
            <Link href="/admin/subscriber-links" className="mobile-console-tool-link"><strong>Subscriber Links</strong><small>Verify portal requests</small></Link>
            <Link href="/admin/revenue" className="mobile-console-tool-link"><strong>Revenue & Collections</strong><small>Paid, unpaid & analytics</small></Link>
            <Link href="/admin/roles" className="mobile-console-tool-link"><strong>Staff & Roles</strong><small>Managers & administrators</small></Link>
            <Link href="/admin/account" className="mobile-console-tool-link"><strong>Account Settings</strong><small>Password & admin session</small></Link>
            <button type="button" className="mobile-console-tool-link mobile-console-signout" onClick={() => void signOutAdmin()} disabled={isSigningOut}>
              <strong>{isSigningOut ? "Signing Out..." : "Sign Out"}</strong><small>End this admin session</small>
            </button>
          </div>
        </details>
      </div>

      <div className="admin-console-shell">
        <aside className="admin-console-sidebar" aria-label="Admin workspaces">
          <div className="admin-sidebar-section">
            <span className="admin-sidebar-eyebrow">Workspace</span>
            <nav className="admin-submenu" aria-label="Admin dashboard sections">
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "overview" ? "is-active" : ""}`} onClick={() => openWorkspace("overview")} aria-pressed={activeWorkspace === "overview"}>
                <span><strong>Overview</strong><small>At a glance</small></span>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "customers" ? "is-active" : ""}`} onClick={() => openWorkspace("customers")} aria-pressed={activeWorkspace === "customers"}>
                <span><strong>Customers</strong><small>Subscribers & renewals</small></span>
                <b>{users.length}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "network" ? "is-active" : ""}`} onClick={() => openWorkspace("network")} aria-pressed={activeWorkspace === "network"}>
                <span><strong>Network</strong><small>Status, nodes & coverage</small></span>
                <b>{networkSummary.downCount}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "support" ? "is-active" : ""}`} onClick={() => openWorkspace("support")} aria-pressed={activeWorkspace === "support"}>
                <span><strong>Support</strong><small>Messages & tickets</small></span>
                <b>{supportAttentionCount}</b>
              </button>
              <button type="button" className={`admin-submenu-item ${activeWorkspace === "catalog" ? "is-active" : ""}`} onClick={() => openWorkspace("catalog")} aria-pressed={activeWorkspace === "catalog"}>
                <span><strong>Service Catalog</strong><small>Internet plans</small></span>
                <b>{activePlanCount}</b>
              </button>
            </nav>
          </div>

          <div className="admin-sidebar-section admin-sidebar-tools">
            <span className="admin-sidebar-eyebrow">Tools</span>
            <Link href="/admin/live-chat" className="admin-tool-link">
              <span><strong>Live Chat Inbox</strong><small>Open support conversations</small></span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/admin/operations" className="admin-tool-link">
              <span><strong>Customer Operations</strong><small>Payments & service requests</small></span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/admin/revenue" className="admin-tool-link">
              <span><strong>Revenue & Collections</strong><small>Paid, unpaid & analytics</small></span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/admin/roles" className="admin-tool-link">
              <span><strong>Staff & Roles</strong><small>Managers & administrators</small></span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/admin/account" className="admin-tool-link">
              <span><strong>Account Settings</strong><small>Password & admin session</small></span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/admin/subscriber-links" className="admin-tool-link">
              <span><strong>Subscriber Links</strong><small>Verify portal requests</small></span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </aside>

        <div className="admin-console-content">
          {activeWorkspaceError ? (
            <AsyncState
              kind="error"
              eyebrow="Admin Data"
              title="Some information couldn't load or save"
              message={activeWorkspaceError}
              onRetry={() => void retryActiveWorkspace()}
              retryLabel="Retry This Workspace"
            />
          ) : null}

          {activeWorkspace === "overview" ? (
            <div className="admin-overview">
              <div className="admin-workspace-heading">
                <div>
                  <div className="badge card-badge">Command Center</div>
                  <h2>Overview</h2>
                  <p className="page-intro">The important numbers first. Open a workspace when you need to make changes.</p>
                </div>
                <span className={`status-pill status-${statusSlug(networkSummary.label)}`}>{networkSummary.label}</span>
              </div>

              <div className="admin-overview-grid">
                <button type="button" className="admin-overview-card" onClick={() => openWorkspace("customers")}>
                  <span className="admin-overview-label">Customers</span>
                  <strong>{users.length}</strong>
                  <small>{activeCustomerCount} active service account{activeCustomerCount === 1 ? "" : "s"}</small>
                  <span className="admin-overview-action">Manage customers →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => openWorkspace("network")}>
                  <span className="admin-overview-label">Network</span>
                  <strong>{networkSummary.upCount}/{networkSummary.monitoredCount}</strong>
                  <small>{networkSummary.downCount ? `${networkSummary.downCount} monitored node${networkSummary.downCount === 1 ? "" : "s"} down` : "All monitored nodes responding"}</small>
                  <span className="admin-overview-action">Open network controls →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => openWorkspace("support")}>
                  <span className="admin-overview-label">Support</span>
                  <strong>{supportAttentionCount}</strong>
                  <small>{openTicketCount} unresolved ticket{openTicketCount === 1 ? "" : "s"} · {newMessageCount} new message{newMessageCount === 1 ? "" : "s"}</small>
                  <span className="admin-overview-action">Open support inboxes →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => openWorkspace("catalog")}>
                  <span className="admin-overview-label">Plans</span>
                  <strong>{activePlanCount}</strong>
                  <small>{plans.length} total plan{plans.length === 1 ? "" : "s"} saved</small>
                  <span className="admin-overview-action">Manage service catalog →</span>
                </button>

                <button type="button" className="admin-overview-card" onClick={() => openWorkspace("network")}>
                  <span className="admin-overview-label">Coverage</span>
                  <strong>{activeCoverageCount}</strong>
                  <small>{coverageRegions.length} saved region{coverageRegions.length === 1 ? "" : "s"}</small>
                  <span className="admin-overview-action">Manage coverage →</span>
                </button>

                <div className="admin-overview-card admin-overview-card-static">
                  <span className="admin-overview-label">Monitor heartbeat</span>
                  <strong className="admin-overview-time">{formatRelativeTime(monitorHeartbeat)}</strong>
                  <small>{globalMaintenance ? "Global maintenance mode is active" : "Automatic monitoring enabled"}</small>
                  <span className="admin-overview-action">Live network status</span>
                </div>
              </div>

            </div>
          ) : null}

          {activeWorkspace === "network" ? (<>
      <div className="admin-workspace-heading admin-network-heading">
        <div>
          <div className="badge card-badge">Network Operations</div>
          <h2>Network</h2>
          <p className="page-intro">Monitor the network, manage service nodes, and control public coverage without squeezing everything into one row.</p>
        </div>
      </div>

      <article className="card admin-network-status-strip">
        <div className="admin-network-status-summary">
          <div className="badge card-badge">Automatic Monitoring</div>
          <div className="network-status-display admin-network-status-display">
            <span className={`network-dot status-dot-${statusSlug(networkSummary.label)}`} />
            <div>
              <span className="admin-network-status-label">Current status</span>
              <strong>{networkSummary.label}</strong>
            </div>
          </div>
        </div>

        <div className="admin-network-status-details">
          <div className="network-health-metrics admin-network-health-metrics">
            <span><strong>{networkSummary.upCount}</strong> online</span>
            <span><strong>{networkSummary.downCount}</strong> down</span>
            <span><strong>{networkSummary.monitoredCount}</strong> monitored</span>
          </div>
          <p className={`monitor-heartbeat admin-network-heartbeat ${monitorHeartbeat && !heartbeatIsFresh(monitorHeartbeat) ? "monitor-heartbeat-stale" : ""}`}>
            Latest agent heartbeat: <strong>{formatRelativeTime(monitorHeartbeat)}</strong>
          </p>
          {storedNetworkStatus !== networkSummary.label ? <p className="field-note admin-network-sync-note">Database status is syncing from the monitor ({storedNetworkStatus}).</p> : null}
        </div>

        <div className="admin-network-status-control">
          <button
            type="button"
            className={`btn ${globalMaintenance ? "btn-danger" : "btn-secondary"}`}
            onClick={() => void updateGlobalMaintenance(!globalMaintenance)}
            disabled={isUpdatingStatus}
          >
            {isUpdatingStatus ? "Updating..." : globalMaintenance ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
          </button>
          <p className="field-note">Use the manual override only for planned maintenance. Node up/down state stays automatic.</p>
        </div>
      </article>

      <MonitorAgentsPanel nodes={nodes} />

      <article className="card admin-network-nodes-card">
        <div className="section-heading-row admin-network-nodes-heading">
          <div>
            <div className="badge card-badge">Infrastructure</div>
            <h2>Service Nodes</h2>
            <p className="page-intro">Add service nodes as simple monitoring targets. Which routers can watch each node is configured separately in Monitoring Agents above.</p>
          </div>
          <span className="status-pill status-active">{nodes.length} saved · {networkSummary.monitoredCount} monitored</span>
        </div>

        <div className="admin-network-node-controls">
          <form className="node-add-form node-add-form-monitoring" onSubmit={addNode}>
            <input value={newNodeName} onChange={(event) => setNewNodeName(event.target.value)} placeholder="Node name, e.g. Ainata" required />
            <input value={newNodeIp} onChange={(event) => setNewNodeIp(event.target.value)} placeholder="Monitoring IP, e.g. 10.0.1.1" required />
            <button type="submit" className="btn btn-primary">Add Node</button>
          </form>
          <p className="field-note">Nodes saved here are only monitoring targets. Assign them to every Monitoring Agent that can reach them; a node may be watched by multiple agents for redundancy.</p>

          <div className="list-toolbar list-toolbar-three node-filter-toolbar admin-network-node-filter">
            <input className="admin-search" value={nodeSearch} onChange={(event) => setNodeSearch(event.target.value)} placeholder="Search node name or IP..." />
            <select value={nodeStatusFilter} onChange={(event) => setNodeStatusFilter(event.target.value)}><option value="all">All node states</option><option value="up">Online</option><option value="down">Offline</option><option value="maintenance">Maintenance</option><option value="unknown">Waiting / stale</option><option value="disabled">Monitoring off</option></select>
            <select value={nodeSort} onChange={(event) => setNodeSort(event.target.value)}><option value="name_az">Name A–Z</option><option value="status">Status</option><option value="last_seen">Recently seen</option><option value="customers">Most customers</option></select>
          </div>
        </div>

        {nodeError ? <p className="form-alert form-alert-error">{nodeError}</p> : null}
        {nodeMessage ? <p className="form-alert form-alert-success">{nodeMessage}</p> : null}

        <div className="node-monitor-list admin-network-node-grid fixed-scroll-list">
          {visibleNodes.map((node) => {
            const customerCount = users.filter((user) => user.node_id === node.id).length;
            const resultFresh = heartbeatIsFresh(node.last_checked_at);
            const physicalLabel = !node.monitor_enabled
              ? "Monitoring Off"
              : !node.last_checked_at
                ? "Waiting"
                : !resultFresh
                  ? "Stale"
                  : node.probe_status === "up"
                    ? "Online"
                    : node.probe_status === "down"
                      ? "Offline"
                      : "Waiting";
            const physicalClass = !node.monitor_enabled ? "disabled" : !resultFresh ? "unknown" : node.probe_status;
            return (
              <article className="node-monitor-card" key={node.id}>
                <div className="node-monitor-heading">
                  <div>
                    <strong>{node.name}</strong>
                    <code>{node.monitor_ip ?? "No monitoring IP"}</code>
                  </div>
                  <span className={`node-probe-badge node-probe-${physicalClass}`}>{physicalLabel}</span>
                </div>
                <div className="node-monitor-metrics">
                  <span><strong>{node.latency_ms ?? "—"}</strong>{node.latency_ms === null ? " latency" : " ms"}</span>
                  <span><strong>{formatRelativeTime(node.last_checked_at)}</strong> last checked</span>
                  <span><strong>{formatRelativeTime(node.last_seen_at)}</strong> last seen</span>
                  <span><strong>{customerCount}</strong> customer{customerCount === 1 ? "" : "s"}</span>
                </div>
                {node.maintenance_mode ? (
                  <p className="node-maintenance-note"><strong>Maintenance active.</strong> {node.maintenance_message || "Customers on this node are being told that maintenance is in progress."}</p>
                ) : null}
                <div className="plan-actions node-monitor-actions">
                  <button type="button" className={`btn btn-compact ${node.maintenance_mode ? "btn-danger" : "btn-secondary"}`} disabled={savingNodeId === node.id} onClick={() => void toggleNodeMaintenance(node)}>
                    {node.maintenance_mode ? "End Maintenance" : "Maintenance"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-compact" disabled={savingNodeId === node.id} onClick={() => void updateNode(node, { monitor_enabled: !node.monitor_enabled })}>
                    {node.monitor_enabled ? "Pause Monitoring" : "Enable Monitoring"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-compact" disabled={savingNodeId === node.id} onClick={() => void editNode(node)}>Edit</button>
                  <button type="button" className="btn btn-danger btn-compact" disabled={savingNodeId === node.id} onClick={() => void deleteNode(node)}>Delete</button>
                </div>
              </article>
            );
          })}
          {!visibleNodes.length ? <span className="empty-state admin-network-node-empty">No nodes match the current search or filters.</span> : null}
        </div>
      </article>

      <article className="card admin-section">
        <div className="section-heading-row">
          <div>
            <div className="badge card-badge">Coverage Control</div>
            <h2>Coverage Regions</h2>
            <p className="page-intro">Control exactly which regions appear on the public homepage and Coverage page. Hidden regions stay saved here but disappear from the public site.</p>
          </div>
          <span className="status-pill status-active">{coverageRegions.filter((region) => region.is_active).length} active</span>
        </div>

        <form className="form-grid" onSubmit={addCoverageRegion}>
          <div className="badge card-badge">English · required</div>
          <div className="form-two-col">
            <label>Region name<input value={newRegionName} onChange={(event) => setNewRegionName(event.target.value)} placeholder="e.g. Ainata" required /></label>
            <label>Description<input value={newRegionDescription} onChange={(event) => setNewRegionDescription(event.target.value)} placeholder="Short availability note for customers" /></label>
          </div>
          <div className="badge card-badge">Translations · optional</div>
          <div className="form-two-col">
            <label>Region name · French<input value={newRegionNameFr} onChange={(event) => setNewRegionNameFr(event.target.value)} placeholder="French name" /></label>
            <label>Description · French<input value={newRegionDescriptionFr} onChange={(event) => setNewRegionDescriptionFr(event.target.value)} placeholder="French availability note" /></label>
            <label>Region name · Arabic<input dir="rtl" value={newRegionNameAr} onChange={(event) => setNewRegionNameAr(event.target.value)} placeholder="الاسم بالعربية" /></label>
            <label>Description · Arabic<input dir="rtl" value={newRegionDescriptionAr} onChange={(event) => setNewRegionDescriptionAr(event.target.value)} placeholder="ملاحظة التغطية بالعربية" /></label>
          </div>
          <p className="field-note">Leave translations blank to show the English content automatically.</p>
          <div className="section-actions"><button type="submit" className="btn btn-primary">Add Coverage Region</button></div>
        </form>

        {coverageError ? <p className="form-alert form-alert-error">{coverageError}</p> : null}
        {coverageMessage ? <p className="form-alert form-alert-success">{coverageMessage}</p> : null}
        <div className="list-toolbar list-toolbar-three">
          <input className="admin-search" value={coverageSearch} onChange={(event) => setCoverageSearch(event.target.value)} placeholder="Search coverage regions..." />
          <select value={coverageVisibilityFilter} onChange={(event) => setCoverageVisibilityFilter(event.target.value)}><option value="all">All visibility</option><option value="public">Public</option><option value="hidden">Hidden</option></select>
          <select value={coverageSort} onChange={(event) => setCoverageSort(event.target.value)}><option value="order">Display order</option><option value="name">Name A–Z</option></select>
        </div>

        <div className="plan-list fixed-scroll-list">
          {visibleCoverageRegions.map((region) => (
            <div className="plan-row" key={region.id}>
              <div className="plan-summary">
                <div className="plan-name-row"><strong>{region.name}</strong><span className={`status-pill ${region.is_active ? "status-active" : "status-inactive"}`}>{region.is_active ? "Public" : "Hidden"}</span></div>
                <div className="plan-meta"><span>{region.description || "No public description"}</span><span>Order: {region.sort_order}</span></div>
              </div>
              <div className="plan-actions">
                <button type="button" className="btn btn-secondary btn-compact" disabled={savingRegionId === region.id} onClick={() => {
                  const name = window.prompt("Region name · English", region.name)?.trim();
                  if (!name) return;
                  const description = window.prompt("Public description · English", region.description ?? "");
                  if (description === null) return;
                  const name_fr = window.prompt("Region name · French (optional)", region.name_fr ?? "");
                  if (name_fr === null) return;
                  const description_fr = window.prompt("Public description · French (optional)", region.description_fr ?? "");
                  if (description_fr === null) return;
                  const name_ar = window.prompt("Region name · Arabic (optional)", region.name_ar ?? "");
                  if (name_ar === null) return;
                  const description_ar = window.prompt("Public description · Arabic (optional)", region.description_ar ?? "");
                  if (description_ar === null) return;
                  void updateCoverageRegion(region, {
                    name,
                    description: description.trim() || null,
                    name_fr: name_fr.trim() || null,
                    description_fr: description_fr.trim() || null,
                    name_ar: name_ar.trim() || null,
                    description_ar: description_ar.trim() || null,
                  });
                }}>Edit</button>
                <button type="button" className="btn btn-secondary btn-compact" disabled={savingRegionId === region.id} onClick={() => void updateCoverageRegion(region, { is_active: !region.is_active })}>{region.is_active ? "Hide" : "Publish"}</button>
                <button type="button" className="btn btn-secondary btn-compact" disabled={savingRegionId === region.id} onClick={() => {
                  const value = window.prompt("Display order (lower numbers appear first)", String(region.sort_order));
                  if (value === null) return;
                  const sort_order = Number(value);
                  if (!Number.isInteger(sort_order)) { setCoverageError("Display order must be a whole number."); return; }
                  void updateCoverageRegion(region, { sort_order });
                }}>Order</button>
                <button type="button" className="btn btn-danger btn-compact" disabled={savingRegionId === region.id} onClick={() => void deleteCoverageRegion(region)}>Delete</button>
              </div>
            </div>
          ))}
          {!visibleCoverageRegions.length ? <p className="empty-state">No coverage regions match the current search or filters.</p> : null}
        </div>
      </article>

          </>) : null}

          {activeWorkspace === "support" ? (
      <article className="card admin-section">
        <div className="section-heading-row">
          <div>
            <div className="badge card-badge">Contact Inbox</div>
            <h2>Contact Us Messages</h2>
            <p className="page-intro">Messages sent from the public Contact Us form appear here. Review them, change their status, or reply by email.</p>
          </div>
        </div>

        <div className="admin-filter-grid admin-filter-grid-contact">
          <input className="admin-search" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Search sender, email, subject, message..." />
          <select value={contactStatusFilter} onChange={(event) => setContactStatusFilter(event.target.value)}>
            <option value="all">All messages</option>
            <option value="new">New</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="spam">Spam</option>
          </select>
          <select value={contactSort} onChange={(event) => setContactSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>

        {contactError ? <p className="form-alert form-alert-error">{contactError}</p> : null}
        {contactMessage ? <p className="form-alert form-alert-success">{contactMessage}</p> : null}

        <div className="admin-list-meta">
          <span>{filteredContactInquiries.length} message{filteredContactInquiries.length === 1 ? "" : "s"}</span>
          <span>{contactInquiries.filter((item) => item.status === "new").length} new</span>
        </div>

        <div className="contact-inquiry-list admin-scroll-list">
          {pagedContactInquiries.map((inquiry) => (
            <article className="contact-inquiry-row" key={inquiry.id}>
              <div className="contact-inquiry-topline">
                <div>
                  <div className="contact-inquiry-title-row">
                    <strong>{inquiry.subject}</strong>
                    <span className={`status-pill status-${inquiry.status}`}>{inquiry.status.replaceAll("_", " ")}</span>
                  </div>
                  <p className="contact-inquiry-sender">{inquiry.name} · <a href={`mailto:${inquiry.email}`} className="text-link">{inquiry.email}</a>{inquiry.phone ? ` · ${inquiry.phone}` : ""}</p>
                </div>
                <time>{new Date(inquiry.created_at).toLocaleString()}</time>
              </div>
              <p className="contact-inquiry-message">{inquiry.message}</p>
              <div className="contact-inquiry-actions">
                <select value={inquiry.status} onChange={(event) => updateContactStatus(inquiry.id, event.target.value as ContactInquiry["status"])} disabled={updatingContactId === inquiry.id}>
                  {contactStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                </select>
                <a className="btn btn-primary btn-compact" href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: ${inquiry.subject}`)}`}>Reply by Email</a>
                <button type="button" className="btn btn-danger btn-compact" disabled={updatingContactId === inquiry.id} onClick={() => deleteContactInquiry(inquiry)}>Delete</button>
              </div>
            </article>
          ))}
          {!pagedContactInquiries.length ? <p className="empty-state">No contact messages match these filters.</p> : null}
        </div>

        <div className="admin-pagination">
          <button type="button" className="btn btn-secondary btn-compact" disabled={contactPage <= 1} onClick={() => setContactPage((page) => Math.max(1, page - 1))}>Previous</button>
          <span>{filteredContactInquiries.length ? `${(Math.min(contactPage, contactPageCount) - 1) * PAGE_SIZE + 1}–${Math.min(Math.min(contactPage, contactPageCount) * PAGE_SIZE, filteredContactInquiries.length)} of ${filteredContactInquiries.length}` : "0 messages"}</span>
          <button type="button" className="btn btn-secondary btn-compact" disabled={contactPage >= contactPageCount} onClick={() => setContactPage((page) => Math.min(contactPageCount, page + 1))}>Next</button>
        </div>
      </article>

          ) : null}

          {activeWorkspace === "customers" ? (
      <article className="card admin-section">
        <div className="section-heading-row">
          <div>
            <div className="badge card-badge">Subscriber Management</div>
            <h2>Customers</h2>
            <p className="page-intro">Ten customers are shown at a time. Search or filter by service status, plan, and node.</p>
          </div>
        </div>

        <div className="admin-filter-grid">
          <input className="admin-search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, phone, address, plan, node..." />
          <select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending_installation">Pending installation</option>
            <option value="suspended">Suspended</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <select value={userPlanFilter} onChange={(event) => setUserPlanFilter(event.target.value)}>
            <option value="all">All plans</option>
            <option value="none">No plan</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          <select value={userNodeFilter} onChange={(event) => setUserNodeFilter(event.target.value)}>
            <option value="all">All nodes</option>
            <option value="none">No node</option>
            {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
          </select>
          <select value={userSort} onChange={(event) => setUserSort(event.target.value)}><option value="name_az">Name A–Z</option><option value="status">Status</option><option value="renewal">Renewal date</option></select>
        </div>

        {userError ? <p className="form-alert form-alert-error">{userError}</p> : null}
        {userMessage ? <p className="form-alert form-alert-success">{userMessage}</p> : null}

        <div className="admin-list-meta">
          <span>{filteredUsers.length} matching customer{filteredUsers.length === 1 ? "" : "s"}</span>
          <span>Page {Math.min(userPage, userPageCount)} of {userPageCount}</span>
        </div>

        <div className="customer-list admin-scroll-list">
          {pagedUsers.map((user) => {
            const draft = draftFor(user);
            const isEditing = selectedUserId === user.id;
            const selectedPlan = plans.find((plan) => String(plan.id) === draft.plan_id);
            const selectedNode = nodes.find((node) => node.id === draft.node_id);
            const savedCustomerLocation = customerLocationMap.get(user.id) ?? null;
            return (
              <div className={`customer-row ${isEditing ? "customer-row-open" : ""}`} key={user.id}>
                <div className="customer-summary">
                  <div>
                    <strong>{user.full_name || "Unnamed customer"}</strong>
                    <span className="customer-id">{user.id.slice(0, 8)}…</span>
                  </div>
                  <div className="customer-details">
                    <span>{user.phone || "No phone"}</span>
                    <span>{user.address || "No address"}</span>
                    <span>{selectedNode?.name || "No node"}</span>
                    <span>{selectedPlan?.name || "No plan"}</span>
                    <span>{savedCustomerLocation ? "Location saved" : "No saved location"}</span>
                    <span className={`status-pill status-${user.service_status}`}>{user.service_status.replaceAll("_", " ")}</span>
                  </div>
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => setSelectedUserId(isEditing ? null : user.id)}>
                    {isEditing ? "Close" : "Manage"}
                  </button>
                </div>

                {isEditing ? (
                  <div className="customer-editor">
                    <label>Full name<input value={draft.full_name} onChange={(event) => updateDraft(user, { full_name: event.target.value })} placeholder="Customer name" /></label>
                    <label>Phone<input value={draft.phone} onChange={(event) => updateDraft(user, { phone: event.target.value })} placeholder="+961 ..." /></label>
                    <label>Address<input value={draft.address} onChange={(event) => updateDraft(user, { address: event.target.value })} placeholder="Street, village, building..." /></label>
                    <div className="customer-location-readonly">
                      <span className="admin-overview-label">Saved Service Location</span>
                      {savedCustomerLocation ? (
                        <>
                          <strong>{savedCustomerLocation.latitude.toFixed(6)}, {savedCustomerLocation.longitude.toFixed(6)}</strong>
                          <small>{savedCustomerLocation.accuracy_m ? `±${Math.round(savedCustomerLocation.accuracy_m)} m · ` : ""}Updated {new Date(savedCustomerLocation.updated_at).toLocaleString()}</small>
                          <a className="btn btn-secondary btn-compact" href={locationMapUrl({ latitude: savedCustomerLocation.latitude, longitude: savedCustomerLocation.longitude })} target="_blank" rel="noreferrer">Open in Maps ↗</a>
                        </>
                      ) : <span className="field-note">This customer has not saved a service location yet.</span>}
                    </div>
                    <label>Service node
                      <select value={draft.node_id} onChange={(event) => updateDraft(user, { node_id: event.target.value })}>
                        <option value="">No node assigned</option>
                        {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                      </select>
                    </label>
                    <label>Service plan
                      <select value={draft.plan_id} onChange={(event) => updateDraft(user, { plan_id: event.target.value })}>
                        <option value="">No plan assigned</option>
                        {plans.filter((plan) => plan.is_active || String(plan.id) === draft.plan_id).map((plan) => (
                          <option key={plan.id} value={plan.id}>{plan.name} · ${plan.monthly_price_usd}/mo</option>
                        ))}
                      </select>
                    </label>
                    <label>Service status
                      <select value={draft.service_status} onChange={(event) => updateDraft(user, { service_status: event.target.value })}>
                        <option value="active">Active</option>
                        <option value="pending_installation">Pending installation</option>
                        <option value="suspended">Suspended</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </label>
                    <label>Activation date<input type="date" value={draft.activation_date} onChange={(event) => updateDraft(user, { activation_date: event.target.value })} /></label>
                    <label>Next renewal<input type="date" value={draft.renewal_date} onChange={(event) => updateDraft(user, { renewal_date: event.target.value })} /></label>
                    <label>Renewal behavior
                      <select
                        value={draft.renewal_auto_advance ? "auto" : "manual"}
                        onChange={(event) => updateDraft(user, { renewal_auto_advance: event.target.value === "auto" })}
                      >
                        <option value="manual">Manual date</option>
                        <option value="auto">Auto-advance after payment</option>
                      </select>
                    </label>
                    {draft.renewal_auto_advance ? (
                      <>
                        <label>Renew every
                          <input
                            type="number"
                            min="1"
                            max="52"
                            step="1"
                            value={draft.renewal_interval_value}
                            onChange={(event) => updateDraft(user, { renewal_interval_value: event.target.value })}
                          />
                        </label>
                        <label>Renewal interval
                          <select
                            value={draft.renewal_interval_unit}
                            onChange={(event) => updateDraft(user, { renewal_interval_unit: event.target.value as ProfileDraft["renewal_interval_unit"] })}
                          >
                            <option value="week">Week(s)</option>
                            <option value="month">Month(s)</option>
                            <option value="year">Year(s)</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    <div className="customer-editor-actions">
                      <button type="button" className="btn btn-primary" onClick={() => saveUser(user)} disabled={savingUserId === user.id || deletingUserId === user.id}>
                        {savingUserId === user.id ? "Saving..." : "Save Customer"}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setSelectedUserId(null)} disabled={deletingUserId === user.id}>Cancel</button>
                      <button type="button" className="btn btn-danger admin-danger-action" onClick={() => void deleteCustomerAccount(user)} disabled={deletingUserId === user.id || savingUserId === user.id}>
                        {deletingUserId === user.id ? "Deleting..." : "Delete Customer Account"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!pagedUsers.length ? <p className="empty-state">No customers match these filters.</p> : null}
        </div>

        <div className="admin-pagination">
          <button type="button" className="btn btn-secondary btn-compact" disabled={userPage <= 1} onClick={() => { setSelectedUserId(null); setUserPage((page) => Math.max(1, page - 1)); }}>Previous</button>
          <span>{filteredUsers.length ? `${(Math.min(userPage, userPageCount) - 1) * PAGE_SIZE + 1}–${Math.min(Math.min(userPage, userPageCount) * PAGE_SIZE, filteredUsers.length)} of ${filteredUsers.length}` : "0 customers"}</span>
          <button type="button" className="btn btn-secondary btn-compact" disabled={userPage >= userPageCount} onClick={() => { setSelectedUserId(null); setUserPage((page) => Math.min(userPageCount, page + 1)); }}>Next</button>
        </div>
      </article>

          ) : null}

          {activeWorkspace === "catalog" ? (
      <article className="card admin-section">
        <div className="badge card-badge">Service Catalog</div>
        <h2>Internet Plans</h2>
        <p className="page-intro">Create and maintain the plans shown on the public Plans page.</p>
        <form className="form-grid admin-plan-form" onSubmit={savePlan}>
          <div className="badge card-badge">English · required</div>
          <label>Plan name<input value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} placeholder="e.g. Centrum 100" required /></label>
          <label>
            Short description
            <input
              value={planForm.description}
              onChange={(event) => setPlanForm({ ...planForm, description: event.target.value.replace(/[\r\n]+/g, " ") })}
              placeholder="One short line customers can understand at a glance"
              maxLength={160}
              required
            />
            <span className="field-note plan-description-counter">{planForm.description.length}/160 · one line</span>
          </label>
          <div className="badge card-badge">Translations · optional</div>
          <div className="form-two-col">
            <label>Plan name · French<input value={planForm.name_fr} onChange={(event) => setPlanForm({ ...planForm, name_fr: event.target.value })} placeholder="French plan name" /></label>
            <label>Plan name · Arabic<input dir="rtl" value={planForm.name_ar} onChange={(event) => setPlanForm({ ...planForm, name_ar: event.target.value })} placeholder="اسم الباقة بالعربية" /></label>
          </div>
          <div className="form-two-col">
            <label>Short description · French<input value={planForm.description_fr} onChange={(event) => setPlanForm({ ...planForm, description_fr: event.target.value.replace(/[\r\n]+/g, " ") })} placeholder="French description" maxLength={160} /><span className="field-note">{planForm.description_fr.length}/160</span></label>
            <label>Short description · Arabic<input dir="rtl" value={planForm.description_ar} onChange={(event) => setPlanForm({ ...planForm, description_ar: event.target.value.replace(/[\r\n]+/g, " ") })} placeholder="وصف عربي قصير" maxLength={160} /><span className="field-note">{planForm.description_ar.length}/160</span></label>
          </div>
          <p className="field-note">Leave a translation blank to use the English plan name or description automatically.</p>
          <div className="form-four-col">
            <label>Download Mbps <span className="field-note">(optional)</span><input type="number" min="1" value={planForm.speed_down_mbps} onChange={(event) => setPlanForm({ ...planForm, speed_down_mbps: event.target.value })} placeholder="Optional" /></label>
            <label>Upload Mbps <span className="field-note">(optional)</span><input type="number" min="1" value={planForm.speed_up_mbps} onChange={(event) => setPlanForm({ ...planForm, speed_up_mbps: event.target.value })} placeholder="Optional" /></label>
            <label>Monthly quota GB <span className="field-note">(optional)</span><input type="number" min="0" value={planForm.monthly_quota_gb} onChange={(event) => setPlanForm({ ...planForm, monthly_quota_gb: event.target.value })} placeholder="Optional" /></label>
            <label>Monthly price USD<input type="number" min="0" step="0.01" value={planForm.monthly_price_usd} onChange={(event) => setPlanForm({ ...planForm, monthly_price_usd: event.target.value })} required /></label>
          </div>
          {planError ? <p className="form-alert form-alert-error">{planError}</p> : null}
          {planMessage ? <p className="form-alert form-alert-success">{planMessage}</p> : null}
          <div className="section-actions">
            <button type="submit" className="btn btn-primary" disabled={isSavingPlan}>{isSavingPlan ? "Saving..." : editingPlanId === null ? "Add Plan" : "Save Changes"}</button>
            {editingPlanId !== null ? <button type="button" className="btn btn-secondary" onClick={resetPlanForm}>Cancel Edit</button> : null}
          </div>
        </form>
        <div className="list-toolbar list-toolbar-three">
          <input className="admin-search" value={planSearch} onChange={(event) => setPlanSearch(event.target.value)} placeholder="Search plan name, speed or price..." />
          <select value={planStatusFilter} onChange={(event) => setPlanStatusFilter(event.target.value)}><option value="all">All plans</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          <select value={planSort} onChange={(event) => setPlanSort(event.target.value)}><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="speed_high">Speed: high to low</option><option value="name">Name A–Z</option></select>
        </div>
        <div className="plan-list fixed-scroll-list">
          {visiblePlans.map((plan) => (
            <div className="plan-row" key={plan.id}>
              <div className="plan-summary">
                <div className="plan-name-row"><strong>{plan.name}</strong><span className={`status-pill ${plan.is_active ? "status-active" : "status-inactive"}`}>{plan.is_active ? "Active" : "Inactive"}</span></div>
                {plan.description ? <p className="plan-description admin-plan-description">{plan.description}</p> : <p className="field-note">No customer description set yet.</p>}
                <div className="plan-meta">
                  {plan.speed_down_mbps !== null ? <span>↓ {plan.speed_down_mbps} Mbps</span> : null}
                  {plan.speed_up_mbps !== null ? <span>↑ {plan.speed_up_mbps} Mbps</span> : null}
                  {plan.monthly_quota_gb !== null ? <span>{plan.monthly_quota_gb} GB</span> : null}
                  <span>${plan.monthly_price_usd}/month</span>
                </div>
              </div>
              <div className="plan-actions">
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => startEditingPlan(plan)}>Edit</button>
                <button type="button" className="btn btn-secondary btn-compact" onClick={() => togglePlan(plan)}>{plan.is_active ? "Deactivate" : "Activate"}</button>
                <button type="button" className="btn btn-danger btn-compact" onClick={() => deletePlan(plan)}>Delete</button>
              </div>
            </div>
          ))}
          {!visiblePlans.length ? <p className="empty-state">No plans match the current search or filters.</p> : null}
        </div>
      </article>

          ) : null}

          {activeWorkspace === "support" ? (
      <article className="card admin-section">
        <div className="badge card-badge">Incident Management</div>
        <h2>Tickets</h2>
        <div className="list-toolbar list-toolbar-three">
          <input className="admin-search" value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} placeholder="Search ticket number or subject..." />
          <select value={ticketStatusFilter} onChange={(event) => setTicketStatusFilter(event.target.value)}><option value="all">All ticket states</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>
          <select value={ticketSort} onChange={(event) => setTicketSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>
        <ul className="simple-list admin-ticket-list fixed-scroll-list compact-list-height">
          {visibleTickets.length ? visibleTickets.map((ticket) => (
            <li key={ticket.id}><Link href={`/portal/tickets/${ticket.id}`} className="ticket-row"><span><code>#{ticket.id}</code> {ticket.subject}</span><span className={`status-pill status-${ticket.status}`}>{ticket.status.replace("_", " ")}</span></Link></li>
          )) : <li className="empty-state">No tickets match the current search or filters.</li>}
        </ul>
      </article>
          ) : null}
        </div>
      </div>

    </section>
  );
}
