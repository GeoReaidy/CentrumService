export type ProbeStatus = "up" | "down" | "unknown";

export type MonitorNodeSnapshot = {
  monitor_enabled: boolean;
  probe_status: ProbeStatus | string | null;
  last_checked_at?: string | null;
};

export const MONITOR_HEARTBEAT_STALE_MS = 150_000;

export type GlobalNetworkStatus =
  | "Operational"
  | "Partial Outage"
  | "Network Outage"
  | "Maintenance"
  | "Monitoring Unavailable"
  | "Monitoring Pending";

export type GlobalNetworkSummary = {
  label: GlobalNetworkStatus;
  monitoredCount: number;
  upCount: number;
  downCount: number;
  unknownCount: number;
  heartbeatFresh: boolean;
};

export function settingIsEnabled(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function heartbeatIsFresh(value: string | null | undefined, now = Date.now()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return now - timestamp <= MONITOR_HEARTBEAT_STALE_MS;
}

export function deriveGlobalNetworkSummary(
  nodes: MonitorNodeSnapshot[],
  globalMaintenance: boolean,
  heartbeatAt: string | null | undefined,
): GlobalNetworkSummary {
  const monitoredNodes = nodes.filter((node) => node.monitor_enabled);
  const heartbeatFresh = heartbeatIsFresh(heartbeatAt);
  const freshNodes = monitoredNodes.filter((node) => heartbeatIsFresh(node.last_checked_at));
  const upCount = freshNodes.filter((node) => node.probe_status === "up").length;
  const downCount = freshNodes.filter((node) => node.probe_status === "down").length;
  const unknownCount = monitoredNodes.length - upCount - downCount;

  let label: GlobalNetworkStatus;
  if (globalMaintenance) label = "Maintenance";
  else if (!monitoredNodes.length) label = "Monitoring Pending";
  else if (downCount === monitoredNodes.length && unknownCount === 0) label = "Network Outage";
  else if (downCount > 0) label = "Partial Outage";
  else if (upCount === monitoredNodes.length) label = "Operational";
  else if (!freshNodes.length && heartbeatAt && !heartbeatFresh) label = "Monitoring Unavailable";
  else label = "Monitoring Pending";

  return {
    label,
    monitoredCount: monitoredNodes.length,
    upCount,
    downCount,
    unknownCount,
    heartbeatFresh,
  };
}

export type CustomerNodeSnapshot = MonitorNodeSnapshot & {
  maintenance_mode: boolean;
  maintenance_message: string | null;
};

export type CustomerNodeState = {
  key: "online" | "outage" | "maintenance" | "unavailable" | "pending" | "unassigned";
  label: string;
  message: string;
};

export function deriveCustomerNodeState(
  node: CustomerNodeSnapshot | null,
  globalMaintenance: boolean,
  heartbeatAt: string | null | undefined,
): CustomerNodeState {
  if (!node) {
    return {
      key: "unassigned",
      label: "Node Not Assigned",
      message: "Centrum has not assigned a service node to this account yet.",
    };
  }

  if (globalMaintenance || node.maintenance_mode) {
    return {
      key: "maintenance",
      label: "Maintenance",
      message:
        node.maintenance_mode && node.maintenance_message?.trim()
          ? node.maintenance_message.trim()
          : "Your service area is currently under maintenance.",
    };
  }

  if (!node.monitor_enabled) {
    return {
      key: "unavailable",
      label: "Status Unavailable",
      message: "Automatic monitoring is not enabled for your service node yet.",
    };
  }

  if (!node.last_checked_at) {
    if (heartbeatAt && !heartbeatIsFresh(heartbeatAt)) {
      return {
        key: "unavailable",
        label: "Status Unavailable",
        message: "The monitoring agents assigned to your service node are not reporting right now.",
      };
    }

    return {
      key: "pending",
      label: "Checking Status",
      message: "Centrum is waiting for the first confirmed result from a monitoring agent that can reach your service node.",
    };
  }

  if (!heartbeatIsFresh(node.last_checked_at)) {
    return {
      key: "unavailable",
      label: "Status Unavailable",
      message: "Your service node has not produced a fresh monitoring result recently.",
    };
  }

  if (node.probe_status === "up") {
    return {
      key: "online",
      label: "Online",
      message: "Your assigned service node is responding normally.",
    };
  }

  if (node.probe_status === "down") {
    return {
      key: "outage",
      label: "Service Outage",
      message: "Centrum is currently detecting an interruption on your assigned service node.",
    };
  }

  return {
    key: "pending",
    label: "Checking Status",
    message: "Centrum has not received a confirmed up/down result for your service node yet.",
  };
}

export function derivePublicNetworkStatus(
  storedStatus: string | null | undefined,
  globalMaintenance: boolean,
  heartbeatAt: string | null | undefined,
): GlobalNetworkStatus {
  if (globalMaintenance) return "Maintenance";
  if (!heartbeatAt) return "Monitoring Pending";
  if (!heartbeatIsFresh(heartbeatAt)) return "Monitoring Unavailable";

  switch (storedStatus) {
    case "Operational":
    case "Partial Outage":
    case "Network Outage":
    case "Maintenance":
    case "Monitoring Unavailable":
    case "Monitoring Pending":
      return storedStatus;
    default:
      return "Monitoring Pending";
  }
}

export function statusSlug(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export function formatRelativeTime(value: string | null | undefined, now = Date.now()) {
  if (!value) return "Never";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";

  const delta = Math.max(0, now - timestamp);
  if (delta < 5_000) return "Just now";
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}
