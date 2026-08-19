'use client';

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { statusSlug } from "@/lib/network-monitoring";

type CoverageRegion = {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
};

export default function CoveragePage() {
  const supabase = getSupabaseBrowserClient();
  const [networkStatus, setNetworkStatus] = useState("Monitoring Pending");
  const [areas, setAreas] = useState<CoverageRegion[]>([]);
  const [coverageLoading, setCoverageLoading] = useState(() => Boolean(supabase));

  const fetchCoverageRegions = useCallback(async () => {
    if (!supabase) { setCoverageLoading(false); return; }
    const { data, error } = await supabase
        .from("coverage_regions")
        .select("id,name,description,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    if (!error) setAreas((data as CoverageRegion[] | null) ?? []);
    setCoverageLoading(false);
  }, [supabase]);

  const fetchNetworkStatus = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase.rpc("get_public_network_status");
    if (error) return;

    const row = (Array.isArray(data) ? data[0] : null) as { status?: string } | null;
    if (row?.status) setNetworkStatus(row.status);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    void Promise.all([fetchNetworkStatus(), fetchCoverageRegions()]);
    const interval = window.setInterval(() => { void fetchNetworkStatus(); void fetchCoverageRegions(); }, 15000);
    const onFocus = () => { void fetchNetworkStatus(); void fetchCoverageRegions(); };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchNetworkStatus, fetchCoverageRegions, supabase]);

  return (
      <section className="animate-fade-in coverage-page">
        <div className="coverage-hero">
          <div className={`badge badge-pulse page-badge home-status-${statusSlug(networkStatus)}`}>
            Network Status: {networkStatus}
          </div>
          <h1>Coverage across North Bekaa</h1>
          <p className="page-intro coverage-intro">
            Centrum Service is expanding continuously from its local service nodes. Coverage can vary by
            street, building, and installation path, so the fastest way to know for sure is to send us your
            location and we will confirm availability.
          </p>
          <div className="section-actions coverage-actions">
            <Link href="/contact" className="btn btn-primary">Check My Address</Link>
            <Link href="/plans" className="btn btn-secondary">View Internet Plans</Link>
          </div>
        </div>

        <div className="coverage-summary-grid">
          <article className="card coverage-summary-card">
            <div className="badge card-badge">Service Footprint</div>
            <strong className="coverage-summary-value">{coverageLoading ? "…" : `${areas.length}+`}</strong>
            <span>listed coverage areas</span>
          </article>
          <article className="card coverage-summary-card">
            <div className="badge card-badge">Local Support</div>
            <strong className="coverage-summary-value">24/7</strong>
            <span>ticket access from the customer portal</span>
          </article>
          <article className="card coverage-summary-card">
            <div className="badge card-badge">Expansion</div>
            <strong className="coverage-summary-value">Active</strong>
            <span>new locations reviewed as the network grows</span>
          </article>
        </div>

        <div className="coverage-section-heading">
          <div>
            <div className="badge card-badge">Service Areas</div>
            <h2>Where we currently operate</h2>
            <p className="page-intro">These are our main served and expanding areas. Exact availability is confirmed per address.</p>
          </div>
        </div>

        <div className="coverage-area-grid">
          {areas.map((area) => (
              <article className="card coverage-area-card" key={area.id}>
                <span className="coverage-area-dot" aria-hidden="true" />
                <div>
                  <h2>{area.name}</h2>
                  <p>{area.description || "Contact Centrum Service to confirm availability at your exact address."}</p>
                </div>
              </article>
          ))}
          {!coverageLoading && areas.length === 0 ? (
              <article className="card coverage-area-card">
                <div><h2>Coverage list is being updated</h2><p>Contact Centrum Service and we’ll confirm availability for your address directly.</p></div>
              </article>
          ) : null}
        </div>

        <div className="coverage-info-grid">
          <article className="card coverage-info-card">
            <div className="badge card-badge">How It Works</div>
            <h2>Availability is checked locally</h2>
            <p>
              We verify your address against the nearest Centrum service node and the practical installation
              route. That gives you a real answer instead of a generic coverage map.
            </p>
            <ol className="coverage-steps">
              <li><span>1</span><div><strong>Send your location</strong><p>Share your village, street, or map pin.</p></div></li>
              <li><span>2</span><div><strong>We confirm the nearest node</strong><p>Our team checks whether your location can be served.</p></div></li>
              <li><span>3</span><div><strong>Choose your plan</strong><p>Once confirmed, select the plan that fits your home or business.</p></div></li>
            </ol>
          </article>

          <article className="card coverage-info-card coverage-cta-card">
            <div className="badge card-badge">Not Listed?</div>
            <h2>Your area may still be reachable</h2>
            <p>
              The list above is not a street-by-street map. If you are nearby, send us your location and we
              will check whether installation is possible or whether your area is planned for expansion.
            </p>
            <div className="section-actions">
              <Link href="/contact" className="btn btn-primary">Ask About My Area</Link>
              <Link href="/portal/register" className="btn btn-secondary">Create Account</Link>
            </div>
          </article>
        </div>
      </section>
  );
}