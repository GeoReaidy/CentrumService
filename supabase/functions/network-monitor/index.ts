import { createClient } from "npm:@supabase/supabase-js@2";

type ProbeStatus = "up" | "down" | "unknown";

type ProbeReport = {
  node_id?: unknown;
  status?: unknown;
  latency_ms?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

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

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = readSecretKey();
const monitorKey = Deno.env.get("CENTRUM_MONITOR_KEY");

if (!supabaseUrl || !serviceKey) {
  throw new Error("Supabase server credentials are not available to network-monitor.");
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function writeSetting(key: string, value: string) {
  const { error } = await admin.from("system_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

async function refreshAutomaticNetworkStatus() {
  const [{ data: nodes, error: nodesError }, { data: maintenanceRow, error: maintenanceError }] = await Promise.all([
    admin.from("nodes").select("probe_status,last_checked_at").eq("monitor_enabled", true),
    admin.from("system_settings").select("value").eq("key", "global_maintenance").maybeSingle(),
  ]);

  if (nodesError) throw nodesError;
  if (maintenanceError) throw maintenanceError;

  const globalMaintenance = maintenanceRow?.value?.toLowerCase() === "true";
  const monitored = nodes ?? [];
  const staleBefore = Date.now() - 150_000;
  const fresh = monitored.filter((node) => {
    if (!node.last_checked_at) return false;
    const checkedAt = new Date(node.last_checked_at).getTime();
    return Number.isFinite(checkedAt) && checkedAt >= staleBefore;
  });
  const up = fresh.filter((node) => node.probe_status === "up").length;
  const down = fresh.filter((node) => node.probe_status === "down").length;
  const unknown = monitored.length - up - down;

  let label: string;
  if (globalMaintenance) label = "Maintenance";
  else if (!monitored.length || unknown > 0 && down === 0) label = "Monitoring Pending";
  else if (down === monitored.length) label = "Network Outage";
  else if (down > 0) label = "Partial Outage";
  else label = "Operational";

  await writeSetting("network_status", label);
  return { label, monitored: monitored.length, up, down, unknown };
}

Deno.serve(async (request) => {
  if (!monitorKey) {
    return json({ error: "CENTRUM_MONITOR_KEY is not configured." }, 503);
  }

  const suppliedKey = request.headers.get("x-centrum-monitor-key");
  if (!suppliedKey || suppliedKey !== monitorKey) {
    return json({ error: "Unauthorized monitor request." }, 401);
  }

  try {
    const now = new Date().toISOString();

    if (request.method === "GET") {
      // A successful target-list fetch doubles as the monitoring-agent heartbeat.
      await writeSetting("monitor_heartbeat_at", now);
      await refreshAutomaticNetworkStatus();

      const { data, error } = await admin
        .from("nodes")
        .select("id,name,monitor_ip")
        .eq("monitor_enabled", true)
        .not("monitor_ip", "is", null)
        .order("name", { ascending: true });

      if (error) throw error;

      return json({
        ok: true,
        generated_at: now,
        targets: (data ?? []).map((node) => ({
          id: node.id,
          name: node.name,
          ip: node.monitor_ip,
        })),
      });
    }

    if (request.method === "POST") {
      const body = await request.json() as ProbeReport;
      const nodeId = typeof body.node_id === "string" ? body.node_id.trim() : "";
      const status = normalizeStatus(body.status);
      const latencyMs = normalizeLatency(body.latency_ms);

      if (!nodeId || !status) {
        return json({ error: "Expected node_id and status (up, down, or unknown)." }, 400);
      }

      const patch: Record<string, unknown> = {
        probe_status: status,
        latency_ms: status === "up" ? latencyMs : null,
        last_checked_at: now,
      };
      if (status === "up") patch.last_seen_at = now;

      const { data, error } = await admin
        .from("nodes")
        .update(patch)
        .eq("id", nodeId)
        .eq("monitor_enabled", true)
        .select("id,name")
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ error: "Unknown or disabled node." }, 404);

      await writeSetting("monitor_heartbeat_at", now);
      const network = await refreshAutomaticNetworkStatus();

      return json({ ok: true, node: data, network });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("network-monitor failure", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected monitor failure." }, 500);
  }
});
