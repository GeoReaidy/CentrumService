import { createClient } from "npm:@supabase/supabase-js@2";

type ProbeStatus = "up" | "down" | "unknown";
type ProbeReport = { node_id?: unknown; status?: unknown; latency_ms?: unknown };
type MonitorAgent = { id: string; name: string; router_ip: string | null };

const MAX_BODY_BYTES = 8_000;
const STALE_AFTER_MS = 150_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function readSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const single = Deno.env.get("SUPABASE_SECRET_KEY");
  if (single) return single;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? null;
  } catch {
    return null;
  }
}

function normalizeStatus(value: unknown): ProbeStatus | null {
  return value === "up" || value === "down" || value === "unknown" ? value : null;
}

function normalizeLatency(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0 || latency > 60_000) return null;
  return Math.round(latency);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = readSecretKey();
if (!supabaseUrl || !serviceKey) throw new Error("Server credentials unavailable.");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function writeSetting(key: string, value: string) {
  const { error } = await admin.from("system_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

async function authenticateAgent(request: Request): Promise<MonitorAgent | null> {
  const suppliedKey = request.headers.get("x-centrum-monitor-key")?.trim() ?? "";
  if (suppliedKey.length < 32 || suppliedKey.length > 256) return null;

  const credentialHash = await sha256Hex(suppliedKey);
  const { data, error } = await admin
    .from("monitor_agents")
    .select("id,name,router_ip")
    .eq("credential_hash", credentialHash)
    .eq("enabled", true)
    .maybeSingle();

  if (error) throw error;
  return (data as MonitorAgent | null) ?? null;
}

async function touchAgent(agentId: string, now: string) {
  const { error } = await admin
    .from("monitor_agents")
    .update({ last_heartbeat_at: now })
    .eq("id", agentId)
    .eq("enabled", true);
  if (error) throw error;

  // Kept only for backwards-compatible admin displays. Public/customer status
  // now derives health from per-agent/per-node data instead of this global value.
  await writeSetting("monitor_heartbeat_at", now);
}

async function refreshAutomaticNetworkStatus() {
  const [{ data: nodes, error: nodesError }, { data: agents, error: agentsError }, { data: maintenanceRow, error: maintenanceError }] = await Promise.all([
    admin.from("nodes").select("probe_status,last_checked_at").eq("monitor_enabled", true).not("monitor_ip", "is", null),
    admin.from("monitor_agents").select("last_heartbeat_at").eq("enabled", true),
    admin.from("system_settings").select("value").eq("key", "global_maintenance").maybeSingle(),
  ]);

  if (nodesError) throw nodesError;
  if (agentsError) throw agentsError;
  if (maintenanceError) throw maintenanceError;

  const globalMaintenance = maintenanceRow?.value?.toLowerCase() === "true";
  const monitored = nodes ?? [];
  const enabledAgents = agents ?? [];
  const staleBefore = Date.now() - STALE_AFTER_MS;

  const fresh = monitored.filter((node) => {
    if (!node.last_checked_at) return false;
    const checkedAt = new Date(node.last_checked_at).getTime();
    return Number.isFinite(checkedAt) && checkedAt >= staleBefore;
  });

  const up = fresh.filter((node) => node.probe_status === "up").length;
  const down = fresh.filter((node) => node.probe_status === "down").length;
  const unknown = monitored.length - up - down;
  const freshAgents = enabledAgents.filter((agent) => {
    if (!agent.last_heartbeat_at) return false;
    const heartbeat = new Date(agent.last_heartbeat_at).getTime();
    return Number.isFinite(heartbeat) && heartbeat >= staleBefore;
  }).length;
  const anyAgentHasReported = enabledAgents.some((agent) => Boolean(agent.last_heartbeat_at));

  let label: string;
  if (globalMaintenance) label = "Maintenance";
  else if (!monitored.length) label = "Monitoring Pending";
  else if (down === monitored.length && unknown === 0) label = "Network Outage";
  else if (down > 0) label = "Partial Outage";
  else if (up === monitored.length) label = "Operational";
  else if (!fresh.length && enabledAgents.length > 0 && freshAgents === 0 && anyAgentHasReported) label = "Monitoring Unavailable";
  else label = "Monitoring Pending";

  await writeSetting("network_status", label);
  return {
    label,
    monitored: monitored.length,
    up,
    down,
    unknown,
    agents: enabledAgents.length,
    agents_online: freshAgents,
  };
}

Deno.serve(async (request) => {
  const rid = crypto.randomUUID();

  try {
    const agent = await authenticateAgent(request);
    if (!agent) return json({ error: "Unauthorized.", request_id: rid }, 401);

    const now = new Date().toISOString();

    if (request.method === "GET") {
      await touchAgent(agent.id, now);

      const { data: assignments, error: assignmentError } = await admin
        .from("monitor_agent_targets")
        .select("node_id")
        .eq("agent_id", agent.id);
      if (assignmentError) throw assignmentError;

      const nodeIds = (assignments ?? []).map((row) => row.node_id as string);
      let targets: Array<{ id: string; name: string; monitor_ip: string }> = [];

      if (nodeIds.length) {
        const { data, error } = await admin
          .from("nodes")
          .select("id,name,monitor_ip")
          .in("id", nodeIds)
          .eq("monitor_enabled", true)
          .not("monitor_ip", "is", null)
          .order("name", { ascending: true });
        if (error) throw error;
        targets = (data ?? []) as Array<{ id: string; name: string; monitor_ip: string }>;
      }

      const network = await refreshAutomaticNetworkStatus();
      return json({
        ok: true,
        generated_at: now,
        agent: { id: agent.id, name: agent.name },
        network,
        targets: targets.map((node) => ({ id: node.id, name: node.name, ip: node.monitor_ip })),
      });
    }

    if (request.method === "POST") {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > MAX_BODY_BYTES) return json({ error: "Request is too large.", request_id: rid }, 413);

      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "Request is too large.", request_id: rid }, 413);

      let body: ProbeReport;
      try {
        body = JSON.parse(raw || "{}") as ProbeReport;
      } catch {
        return json({ error: "Invalid request.", request_id: rid }, 400);
      }

      const nodeId = typeof body.node_id === "string" ? body.node_id.trim() : "";
      const status = normalizeStatus(body.status);
      const latencyMs = normalizeLatency(body.latency_ms);
      if (!nodeId || !status) return json({ error: "Invalid probe report.", request_id: rid }, 400);

      const { data: assignment, error: assignmentError } = await admin
        .from("monitor_agent_targets")
        .select("node_id")
        .eq("agent_id", agent.id)
        .eq("node_id", nodeId)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) return json({ error: "Node is not assigned to this monitor.", request_id: rid }, 404);

      const { data: node, error: nodeError } = await admin
        .from("nodes")
        .select("id,name,monitor_enabled")
        .eq("id", nodeId)
        .maybeSingle();
      if (nodeError) throw nodeError;
      if (!node || !node.monitor_enabled) return json({ error: "Unknown or disabled node.", request_id: rid }, 404);

      const { error: reportError } = await admin
        .from("monitor_probe_results")
        .upsert(
          {
            agent_id: agent.id,
            node_id: nodeId,
            status,
            latency_ms: status === "up" ? latencyMs : null,
            reported_at: now,
          },
          { onConflict: "agent_id,node_id" },
        );
      if (reportError) throw reportError;

      // The database trigger recomputes the aggregate node state. ANY fresh UP
      // from an enabled assigned agent wins over DOWN reports from other agents.
      await touchAgent(agent.id, now);
      const network = await refreshAutomaticNetworkStatus();

      const { data: aggregateNode, error: aggregateError } = await admin
        .from("nodes")
        .select("id,name,probe_status,latency_ms,last_checked_at,last_seen_at")
        .eq("id", nodeId)
        .maybeSingle();
      if (aggregateError) throw aggregateError;

      return json({
        ok: true,
        agent: { id: agent.id, name: agent.name },
        node: aggregateNode,
        network,
      });
    }

    return json({ error: "Method not allowed.", request_id: rid }, 405);
  } catch (error) {
    console.error("network-monitor failure", { request_id: rid, error });
    return json({ error: "Monitoring request failed.", request_id: rid }, 500);
  }
});
