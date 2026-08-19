'use client';

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { statusSlug } from "@/lib/network-monitoring";

type PublicStatusRow = {
  status: string;
  message: string;
  updated_at: string | null;
};

export function PublicNetworkStatusBadge() {
  const supabase = getSupabaseBrowserClient();
  const [status, setStatus] = useState("Checking");
  const [message, setMessage] = useState("Fetching live Centrum network status.");

  const refresh = useCallback(async () => {
    if (!supabase) {
      setStatus("Monitoring Unavailable");
      setMessage("Live network status is temporarily unavailable.");
      return;
    }

    const { data, error } = await supabase.rpc("get_public_network_status");
    if (error) {
      setStatus("Monitoring Unavailable");
      setMessage("Live network status is temporarily unavailable.");
      return;
    }

    const row = (Array.isArray(data) ? data[0] : null) as PublicStatusRow | null;
    if (!row?.status) {
      setStatus("Monitoring Pending");
      setMessage("Centrum is waiting for fresh monitoring data.");
      return;
    }

    setStatus(row.status);
    setMessage(row.message || "Centrum network status.");
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const visualStatus = status === "Checking" ? "Monitoring Pending" : status;

  return (
      <span
          className={`header-network-status home-status-${statusSlug(visualStatus)}`}
          title={message}
          aria-label={`Network status: ${status}`}
      >
      <span className={`header-network-dot status-dot-${statusSlug(visualStatus)}`} aria-hidden="true" />
      <span>{status === "Checking" ? "Status: Checking…" : `Status: ${status}`}</span>
    </span>
  );
}