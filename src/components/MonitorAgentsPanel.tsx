"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { formatRelativeTime, heartbeatIsFresh } from "@/lib/network-monitoring";
import { buildMonitorAgentInstructions, buildMonitorAgentSetupScript, createMonitorAgentToken, getMonitorAgentFileNames, sha256Hex } from "@/lib/monitor-agent-script";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";

type MonitorNodeOption = {
  id: string;
  name: string;
  monitor_ip: string | null;
  monitor_enabled: boolean;
};

type MonitorAgent = {
  id: string;
  name: string;
  router_ip: string | null;
  enabled: boolean;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

type MonitorAgentTarget = {
  agent_id: string;
  node_id: string;
};

type MonitorProbeResult = {
  agent_id: string;
  node_id: string;
  status: "up" | "down" | "unknown";
  latency_ms: number | null;
  reported_at: string;
};

type GeneratedScript = {
  agentId: string;
  agentName: string;
  script: string;
  instructions: string;
  scriptFileName: string;
  instructionsFileName: string;
};

type TargetFilter = "all" | "assigned" | "unassigned";

const TARGET_PAGE_SIZE = 40;

type Props = {
  nodes: MonitorNodeOption[];
};

function newestTimestamp(values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms) && ms > latestMs) {
      latest = value;
      latestMs = ms;
    }
  }
  return latest;
}


export function MonitorAgentsPanel({ nodes }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [agents, setAgents] = useState<MonitorAgent[]>([]);
  const [targets, setTargets] = useState<MonitorAgentTarget[]>([]);
  const [results, setResults] = useState<MonitorProbeResult[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentIp, setNewAgentIp] = useState("");
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [targetVisibleCount, setTargetVisibleCount] = useState(TARGET_PAGE_SIZE);

  const endpoint = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
    return base ? `${base}/functions/v1/network-monitor` : "";
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const [agentResponse, targetResponse, resultResponse] = await Promise.all([
      supabase.from("monitor_agents").select("id,name,router_ip,enabled,last_heartbeat_at,created_at,updated_at").order("name", { ascending: true }),
      supabase.from("monitor_agent_targets").select("agent_id,node_id"),
      supabase.from("monitor_probe_results").select("agent_id,node_id,status,latency_ms,reported_at"),
    ]);

    const firstError = agentResponse.error ?? targetResponse.error ?? resultResponse.error;
    if (firstError) {
      console.error("Monitor agents load failed", firstError);
      setError(toFriendlyErrorMessage(firstError, "Monitoring agents could not be loaded right now."));
      setIsLoading(false);
      return;
    }

    setError("");
    setAgents((agentResponse.data as MonitorAgent[] | null) ?? []);
    setTargets((targetResponse.data as MonitorAgentTarget[] | null) ?? []);
    setResults((resultResponse.data as MonitorProbeResult[] | null) ?? []);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchAgents();
    if (!supabase) return;
    const interval = window.setInterval(() => void fetchAgents(), 10_000);
    const onFocus = () => void fetchAgents();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchAgents, supabase]);

  useEffect(() => {
    setTargetSearch("");
    setTargetFilter("all");
    setTargetVisibleCount(TARGET_PAGE_SIZE);
  }, [expandedAgentId]);

  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);
  const onlineAgentCount = useMemo(() => enabledAgents.filter((agent) => heartbeatIsFresh(agent.last_heartbeat_at)).length, [enabledAgents]);
  const latestHeartbeat = useMemo(() => newestTimestamp(enabledAgents.map((agent) => agent.last_heartbeat_at)), [enabledAgents]);

  const monitorCountByNode = useMemo(() => {
    const enabledAgentIds = new Set(enabledAgents.map((agent) => agent.id));
    const counts = new Map<string, number>();
    for (const target of targets) {
      if (!enabledAgentIds.has(target.agent_id)) continue;
      counts.set(target.node_id, (counts.get(target.node_id) ?? 0) + 1);
    }
    return counts;
  }, [enabledAgents, targets]);

  const monitoredNodes = nodes.filter((node) => node.monitor_enabled);
  const uncoveredNodes = monitoredNodes.filter((node) => (monitorCountByNode.get(node.id) ?? 0) === 0);
  const redundantNodeCount = monitoredNodes.filter((node) => (monitorCountByNode.get(node.id) ?? 0) >= 2).length;

  async function issueCredential(agentName: string, routerIp: string | null) {
    if (!endpoint) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing, so a RouterOS script cannot be generated.");
    const token = createMonitorAgentToken();
    const credentialHash = await sha256Hex(token);
    const script = buildMonitorAgentSetupScript({ agentName, endpoint, token });
    const { scriptFileName, instructionsFileName } = getMonitorAgentFileNames(agentName);
    const instructions = buildMonitorAgentInstructions({ agentName, routerIp, scriptFileName });
    return { credentialHash, script, instructions, scriptFileName, instructionsFileName };
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const name = newAgentName.trim();
    const routerIp = newAgentIp.trim();
    if (!name || !routerIp) {
      setError("Enter a monitoring-agent name and router IP.");
      return;
    }

    setSavingAgentId("new");
    setError("");
    setMessage("");
    try {
      const { credentialHash, script, instructions, scriptFileName, instructionsFileName } = await issueCredential(name, routerIp);
      const { data, error: insertError } = await supabase
        .from("monitor_agents")
        .insert({ name, router_ip: routerIp, credential_hash: credentialHash, enabled: true })
        .select("id,name,router_ip,enabled,last_heartbeat_at,created_at,updated_at")
        .single();
      if (insertError) throw insertError;

      const agent = data as MonitorAgent;
      setNewAgentName("");
      setNewAgentIp("");
      setGeneratedScript({ agentId: agent.id, agentName: agent.name, script, instructions, scriptFileName, instructionsFileName });
      setExpandedAgentId(agent.id);
      setMessage(`Monitoring agent “${agent.name}” was created. Assign the nodes it can reach, then install its generated RouterOS script.`);
      await fetchAgents();
    } catch (caught) {
      const problem = caught instanceof Error ? caught : new Error("Unknown error");
      setError(toFriendlyErrorMessage(problem, "The monitoring agent could not be created. Please try again."));
    } finally {
      setSavingAgentId(null);
    }
  }

  async function editAgent(agent: MonitorAgent) {
    if (!supabase) return;
    const name = window.prompt("Monitoring agent name", agent.name)?.trim();
    if (!name) return;
    const routerIp = window.prompt("Router IP", agent.router_ip ?? "")?.trim();
    if (!routerIp) return;

    setSavingAgentId(agent.id);
    setError("");
    const { error: updateError } = await supabase.from("monitor_agents").update({ name, router_ip: routerIp }).eq("id", agent.id);
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The monitoring agent could not be changed."));
    else {
      setMessage(`“${name}” was updated.`);
      await fetchAgents();
    }
    setSavingAgentId(null);
  }

  async function toggleAgent(agent: MonitorAgent) {
    if (!supabase) return;
    setSavingAgentId(agent.id);
    setError("");
    const enabled = !agent.enabled;
    const { error: updateError } = await supabase.from("monitor_agents").update({ enabled }).eq("id", agent.id);
    if (updateError) setError(toFriendlyErrorMessage(updateError, "The monitoring agent could not be changed."));
    else {
      setMessage(enabled ? `“${agent.name}” is enabled again.` : `“${agent.name}” is disabled. Its target assignments are preserved.`);
      await fetchAgents();
    }
    setSavingAgentId(null);
  }

  async function regenerateAgentScript(agent: MonitorAgent) {
    if (!supabase) return;
    if (!window.confirm(`Regenerate the setup credential for “${agent.name}”? The currently installed script will stop authenticating as soon as this is saved.`)) return;

    setSavingAgentId(agent.id);
    setError("");
    setMessage("");
    try {
      const { credentialHash, script, instructions, scriptFileName, instructionsFileName } = await issueCredential(agent.name, agent.router_ip);
      const { error: updateError } = await supabase.from("monitor_agents").update({ credential_hash: credentialHash }).eq("id", agent.id);
      if (updateError) throw updateError;
      setGeneratedScript({ agentId: agent.id, agentName: agent.name, script, instructions, scriptFileName, instructionsFileName });
      setMessage(`A new credential was issued for “${agent.name}”. Install the new script on that router now.`);
      await fetchAgents();
    } catch (caught) {
      const problem = caught instanceof Error ? caught : new Error("Unknown error");
      setError(toFriendlyErrorMessage(problem, "The setup credential could not be regenerated."));
    } finally {
      setSavingAgentId(null);
    }
  }

  async function deleteAgent(agent: MonitorAgent) {
    if (!supabase) return;
    const assignedCount = targets.filter((target) => target.agent_id === agent.id).length;
    const suffix = assignedCount ? ` It currently watches ${assignedCount} node${assignedCount === 1 ? "" : "s"}; those service nodes will stay saved and may still be watched by other agents.` : "";
    if (!window.confirm(`Delete monitoring agent “${agent.name}”?${suffix}`)) return;

    setSavingAgentId(agent.id);
    setError("");
    const { error: deleteError } = await supabase.from("monitor_agents").delete().eq("id", agent.id);
    if (deleteError) setError(toFriendlyErrorMessage(deleteError, "The monitoring agent could not be deleted."));
    else {
      if (expandedAgentId === agent.id) setExpandedAgentId(null);
      if (generatedScript?.agentId === agent.id) setGeneratedScript(null);
      setMessage(`“${agent.name}” was deleted. Service nodes were not deleted.`);
      await fetchAgents();
    }
    setSavingAgentId(null);
  }

  async function toggleTarget(agent: MonitorAgent, node: MonitorNodeOption, currentlyAssigned: boolean) {
    if (!supabase) return;
    const key = `${agent.id}:${node.id}`;
    setSavingAgentId(key);
    setError("");
    const response = currentlyAssigned
      ? await supabase.from("monitor_agent_targets").delete().eq("agent_id", agent.id).eq("node_id", node.id)
      : await supabase.from("monitor_agent_targets").insert({ agent_id: agent.id, node_id: node.id });

    if (response.error) setError(toFriendlyErrorMessage(response.error, "The monitoring assignment could not be changed."));
    else {
      setMessage(currentlyAssigned ? `“${node.name}” was removed from ${agent.name}.` : `“${node.name}” is now watched by ${agent.name}.`);
      await fetchAgents();
    }
    setSavingAgentId(null);
  }

  async function changeTargetsBulk(agent: MonitorAgent, nodeIds: string[], assign: boolean) {
    if (!supabase || !nodeIds.length) return;
    setSavingAgentId(`${agent.id}:bulk`);
    setError("");
    setMessage("");

    try {
      for (let start = 0; start < nodeIds.length; start += 100) {
        const chunk = nodeIds.slice(start, start + 100);
        const response = assign
          ? await supabase.from("monitor_agent_targets").insert(chunk.map((nodeId) => ({ agent_id: agent.id, node_id: nodeId })))
          : await supabase.from("monitor_agent_targets").delete().eq("agent_id", agent.id).in("node_id", chunk);
        if (response.error) throw response.error;
      }

      setMessage(`${assign ? "Assigned" : "Removed"} ${nodeIds.length} node${nodeIds.length === 1 ? "" : "s"} ${assign ? `to ${agent.name}` : `from ${agent.name}`}.`);
      await fetchAgents();
    } catch (caught) {
      const problem = caught instanceof Error ? caught : new Error("Unknown error");
      setError(toFriendlyErrorMessage(problem, "The bulk monitoring assignments could not be changed."));
    } finally {
      setSavingAgentId(null);
    }
  }

  async function copyGeneratedScript() {
    if (!generatedScript) return;
    try {
      await navigator.clipboard.writeText(generatedScript.script);
      setMessage(`Setup script for “${generatedScript.agentName}” copied to the clipboard.`);
    } catch {
      setError("The browser could not copy the script automatically. Select it from the box and copy it manually.");
    }
  }

  function downloadTextFile(contents: string, fileName: string, type: string) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function downloadGeneratedScript() {
    if (!generatedScript) return;
    downloadTextFile(generatedScript.script, generatedScript.scriptFileName, "text/plain;charset=utf-8");
  }

  function downloadGeneratedInstructions() {
    if (!generatedScript) return;
    downloadTextFile(generatedScript.instructions, generatedScript.instructionsFileName, "text/markdown;charset=utf-8");
  }

  return (
    <article className="card monitor-agents-card">
      <div className="section-heading-row monitor-agents-heading">
        <div>
          <div className="badge card-badge">Monitoring Infrastructure</div>
          <h2>Monitoring Agents</h2>
          <p className="page-intro">Routers here perform the monitoring. Assign every service node to every agent that can reach it; overlapping assignments provide automatic redundancy.</p>
        </div>
        <span className={`status-pill ${onlineAgentCount === enabledAgents.length && enabledAgents.length ? "status-active" : "status-inactive"}`}>
          {onlineAgentCount}/{enabledAgents.length} agents online
        </span>
      </div>

      <div className="monitor-agent-summary-grid">
        <span><strong>{agents.length}</strong><small>saved agents</small></span>
        <span><strong>{redundantNodeCount}</strong><small>nodes with 2+ monitors</small></span>
        <span className={uncoveredNodes.length ? "monitor-summary-warning" : ""}><strong>{uncoveredNodes.length}</strong><small>nodes without a monitor</small></span>
        <span><strong>{formatRelativeTime(latestHeartbeat)}</strong><small>latest agent heartbeat</small></span>
      </div>

      <form className="monitor-agent-add-form" onSubmit={createAgent}>
        <input value={newAgentName} onChange={(event) => setNewAgentName(event.target.value)} placeholder="Agent name, e.g. Main Monitor" required />
        <input value={newAgentIp} onChange={(event) => setNewAgentIp(event.target.value)} placeholder="Router IP, e.g. 10.0.6.2" required />
        <button type="submit" className="btn btn-primary" disabled={savingAgentId === "new"}>{savingAgentId === "new" ? "Creating..." : "Add Monitoring Agent"}</button>
      </form>
      <p className="field-note">Adding an agent does not add or delete service nodes. After creation, choose which existing nodes that router can reach and install the generated script on that router.</p>

      {error ? <p className="form-alert form-alert-error">{error}</p> : null}
      {message ? <p className="form-alert form-alert-success">{message}</p> : null}

      {generatedScript ? (
        <div className="monitor-script-panel">
          <div className="monitor-script-heading">
            <div>
              <strong>Setup files — {generatedScript.agentName}</strong>
              <small>Download both files. The .rsc contains this monitor's private credential; the README contains the WinBox installation and verification commands.</small>
            </div>
            <div className="plan-actions">
              <button type="button" className="btn btn-primary btn-compact" onClick={downloadGeneratedScript}>Download .rsc</button>
              <button type="button" className="btn btn-secondary btn-compact" onClick={downloadGeneratedInstructions}>Download instructions (.md)</button>
              <button type="button" className="btn btn-secondary btn-compact" onClick={() => void copyGeneratedScript()}>Copy Script</button>
              <button type="button" className="btn btn-secondary btn-compact" onClick={() => setGeneratedScript(null)}>Close</button>
            </div>
          </div>
          <p className="field-note">Files: <code>{generatedScript.scriptFileName}</code> + <code>{generatedScript.instructionsFileName}</code></p>
          <textarea className="monitor-script-output" value={generatedScript.script} readOnly spellCheck={false} aria-label={`RouterOS setup script for ${generatedScript.agentName}`} />
        </div>
      ) : null}

      {isLoading ? <p className="empty-state">Loading monitoring agents…</p> : null}
      {!isLoading && !agents.length ? <p className="empty-state">No monitoring agents are configured yet.</p> : null}

      <div className="monitor-agent-list">
        {agents.map((agent) => {
          const agentTargets = targets.filter((target) => target.agent_id === agent.id);
          const fresh = heartbeatIsFresh(agent.last_heartbeat_at);
          const agentState = !agent.enabled ? "Disabled" : !agent.last_heartbeat_at ? "Waiting" : fresh ? "Online" : "Offline";
          const stateClass = !agent.enabled ? "disabled" : fresh ? "up" : "unknown";
          const expanded = expandedAgentId === agent.id;

          return (
            <section className="monitor-agent-row" key={agent.id}>
              <div className="monitor-agent-row-main">
                <div className="monitor-agent-identity">
                  <div>
                    <strong>{agent.name}</strong>
                    <code>{agent.router_ip ?? "No router IP"}</code>
                  </div>
                  <span className={`node-probe-badge node-probe-${stateClass}`}>{agentState}</span>
                </div>
                <div className="node-monitor-metrics">
                  <span><strong>{agentTargets.length}</strong> target{agentTargets.length === 1 ? "" : "s"}</span>
                  <span><strong>{formatRelativeTime(agent.last_heartbeat_at)}</strong> heartbeat</span>
                  <span><strong>{agentTargets.filter((target) => {
                    const result = results.find((item) => item.agent_id === agent.id && item.node_id === target.node_id);
                    return result?.status === "up" && heartbeatIsFresh(result.reported_at);
                  }).length}</strong> freshly reachable</span>
                </div>
                <div className="plan-actions monitor-agent-actions">
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => setExpandedAgentId(expanded ? null : agent.id)}>{expanded ? "Hide Targets" : "Manage Targets"}</button>
                  <button type="button" className="btn btn-secondary btn-compact" disabled={savingAgentId === agent.id} onClick={() => void regenerateAgentScript(agent)}>Regenerate Setup</button>
                  <button type="button" className="btn btn-secondary btn-compact" disabled={savingAgentId === agent.id} onClick={() => void toggleAgent(agent)}>{agent.enabled ? "Disable" : "Enable"}</button>
                  <button type="button" className="btn btn-secondary btn-compact" disabled={savingAgentId === agent.id} onClick={() => void editAgent(agent)}>Edit</button>
                  <button type="button" className="btn btn-danger btn-compact" disabled={savingAgentId === agent.id} onClick={() => void deleteAgent(agent)}>Delete</button>
                </div>
              </div>

              {expanded ? (() => {
                const assignedNodeIds = new Set(agentTargets.map((target) => target.node_id));
                const query = targetSearch.trim().toLowerCase();
                const matchingNodes = nodes.filter((node) => {
                  if (!query) return true;
                  return node.name.toLowerCase().includes(query) || (node.monitor_ip ?? "").toLowerCase().includes(query);
                });
                const filteredNodes = matchingNodes.filter((node) => {
                  const assigned = assignedNodeIds.has(node.id);
                  if (targetFilter === "assigned") return assigned;
                  if (targetFilter === "unassigned") return !assigned;
                  return true;
                });
                const visibleNodes = filteredNodes.slice(0, targetVisibleCount);
                const unassignedFiltered = filteredNodes.filter((node) => !assignedNodeIds.has(node.id));
                const assignedFiltered = filteredNodes.filter((node) => assignedNodeIds.has(node.id));
                const targetBusy = savingAgentId?.startsWith(`${agent.id}:`) ?? false;

                return (
                  <div className="monitor-agent-target-panel">
                    <div className="monitor-target-panel-heading">
                      <strong>Manage nodes reachable from {agent.name}</strong>
                      <small>Search and assign nodes this router can ping. A service node can still be assigned to several monitoring agents for redundancy.</small>
                    </div>

                    <div className="monitor-target-manager-toolbar">
                      <label className="monitor-target-search">
                        <span className="sr-only">Search service nodes</span>
                        <input
                          type="search"
                          value={targetSearch}
                          placeholder="Search node name or IP…"
                          onChange={(event) => {
                            setTargetSearch(event.target.value);
                            setTargetVisibleCount(TARGET_PAGE_SIZE);
                          }}
                        />
                      </label>
                      <div className="monitor-target-filter-group" role="group" aria-label="Filter monitoring targets">
                        {([
                          ["all", `All (${matchingNodes.length})`],
                          ["assigned", `Assigned (${matchingNodes.filter((node) => assignedNodeIds.has(node.id)).length})`],
                          ["unassigned", `Unassigned (${matchingNodes.filter((node) => !assignedNodeIds.has(node.id)).length})`],
                        ] as Array<[TargetFilter, string]>).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={`btn btn-compact ${targetFilter === value ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => {
                              setTargetFilter(value);
                              setTargetVisibleCount(TARGET_PAGE_SIZE);
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="monitor-target-bulk-row">
                      <span><strong>{agentTargets.length}</strong> assigned · <strong>{filteredNodes.length}</strong> shown by current filter</span>
                      <div className="plan-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          disabled={targetBusy || !unassignedFiltered.length}
                          onClick={() => void changeTargetsBulk(agent, unassignedFiltered.map((node) => node.id), true)}
                        >
                          Assign all filtered{unassignedFiltered.length ? ` (${unassignedFiltered.length})` : ""}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          disabled={targetBusy || !assignedFiltered.length}
                          onClick={() => void changeTargetsBulk(agent, assignedFiltered.map((node) => node.id), false)}
                        >
                          Remove all filtered{assignedFiltered.length ? ` (${assignedFiltered.length})` : ""}
                        </button>
                      </div>
                    </div>

                    <div className="monitor-target-list">
                      {visibleNodes.map((node) => {
                        const assigned = assignedNodeIds.has(node.id);
                        const result = results.find((item) => item.agent_id === agent.id && item.node_id === node.id);
                        const resultFresh = heartbeatIsFresh(result?.reported_at);
                        return (
                          <div className={`monitor-target-row ${assigned ? "is-assigned" : ""}`} key={node.id}>
                            <div className="monitor-target-row-copy">
                              <strong>{node.name}</strong>
                              <small>{node.monitor_ip ?? "No monitoring IP"} · {!node.monitor_enabled ? "monitoring paused" : assigned && result ? `${resultFresh ? result.status : "stale"} · ${formatRelativeTime(result.reported_at)}` : assigned ? "waiting for first result" : "not assigned"}</small>
                            </div>
                            <button
                              type="button"
                              className={`btn btn-compact ${assigned ? "btn-secondary" : "btn-primary"}`}
                              disabled={targetBusy}
                              onClick={() => void toggleTarget(agent, node, assigned)}
                            >
                              {savingAgentId === `${agent.id}:${node.id}` ? "Saving…" : assigned ? "Remove" : "Assign"}
                            </button>
                          </div>
                        );
                      })}
                      {!nodes.length ? <p className="empty-state">Add service nodes first, then assign them here.</p> : null}
                      {nodes.length && !filteredNodes.length ? <p className="empty-state">No service nodes match this search and filter.</p> : null}
                    </div>

                    {visibleNodes.length < filteredNodes.length ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact monitor-target-show-more"
                        onClick={() => setTargetVisibleCount((count) => count + TARGET_PAGE_SIZE)}
                      >
                        Show {Math.min(TARGET_PAGE_SIZE, filteredNodes.length - visibleNodes.length)} more
                      </button>
                    ) : null}
                  </div>
                );
              })() : null}
            </section>
          );
        })}
      </div>

      {uncoveredNodes.length ? (
        <div className="monitor-uncovered-warning">
          <strong>{uncoveredNodes.length} monitored service node{uncoveredNodes.length === 1 ? " has" : "s have"} no active monitoring agent.</strong>
          <span>{uncoveredNodes.map((node) => node.name).join(", ")}</span>
        </div>
      ) : null}
    </article>
  );
}
