"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { statusSlug } from "@/lib/network-monitoring";
import { AsyncState } from "@/components/AsyncState";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import type { PublicCoverageRegion } from "@/lib/public-catalog-server";

type CoverageClientProps = {
  initialAreas: PublicCoverageRegion[];
  initialLoadFailed: boolean;
};

export function CoverageClient({
  initialAreas,
  initialLoadFailed,
}: CoverageClientProps) {
  const supabase = getSupabaseBrowserClient();
  const [networkStatus, setNetworkStatus] = useState("Monitoring Pending");
  const [areas, setAreas] =
    useState<PublicCoverageRegion[]>(initialAreas);
  const [coverageLoading, setCoverageLoading] = useState(
    () => initialAreas.length === 0 && initialLoadFailed,
  );
  const [coverageError, setCoverageError] = useState(
    initialLoadFailed
      ? "We couldn't preload the current coverage list. We'll try again from your browser."
      : "",
  );

  const fetchCoverageRegions = useCallback(
    async (showLoading = false) => {
      if (!supabase) {
        if (initialAreas.length === 0) {
          setCoverageError("Coverage information is temporarily unavailable.");
        }
        setCoverageLoading(false);
        return;
      }

      if (showLoading) setCoverageLoading(true);
      setCoverageError("");

      try {
        const { data, error } = await supabase
          .from("coverage_regions")
          .select("id,name,description,sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (error) throw error;
        setAreas((data as PublicCoverageRegion[] | null) ?? []);
      } catch (error) {
        console.error("Failed to refresh public coverage regions", error);
        setCoverageError(
          toFriendlyErrorMessage(
            error,
            "We couldn't refresh the coverage list right now. Please try again.",
          ),
        );
      } finally {
        setCoverageLoading(false);
      }
    },
    [initialAreas.length, supabase],
  );

  const fetchNetworkStatus = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase.rpc("get_public_network_status");
    if (error) {
      setNetworkStatus("Monitoring Unavailable");
      return;
    }

    const row = (Array.isArray(data) ? data[0] : null) as {
      status?: string;
    } | null;
    if (row?.status) setNetworkStatus(row.status);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    void fetchNetworkStatus();
    void fetchCoverageRegions(initialLoadFailed && initialAreas.length === 0);

    const interval = window.setInterval(() => {
      void fetchNetworkStatus();
      void fetchCoverageRegions(false);
    }, 15000);

    const onFocus = () => {
      void fetchNetworkStatus();
      void fetchCoverageRegions(false);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [
    fetchCoverageRegions,
    fetchNetworkStatus,
    initialAreas.length,
    initialLoadFailed,
    supabase,
  ]);

  const noVisibleAreas = areas.length === 0;

  return (
    <section className="animate-fade-in coverage-page">
      <div className="coverage-hero">
        <div
          className={`badge badge-pulse page-badge home-status-${statusSlug(
            networkStatus,
          )}`}
        >
          Network Status: {networkStatus}
        </div>
        <h1>Internet coverage across North Bekaa</h1>
        <p className="page-intro coverage-intro">
          See Centrum Service's currently published coverage areas below. Exact
          availability is confirmed per address because service can vary by
          location and installation path.
        </p>
        <div className="section-actions coverage-actions">
          <Link href="/contact" className="btn btn-primary">
            Check Availability at My Address
          </Link>
          <Link href="/plans" className="btn btn-secondary">
            View Internet Plans
          </Link>
        </div>
      </div>

      <div className="coverage-summary-grid">
        <article className="card coverage-summary-card">
          <div className="badge card-badge">Service Footprint</div>
          <strong className="coverage-summary-value">
            {coverageLoading && noVisibleAreas ? "…" : `${areas.length}+`}
          </strong>
          <span>published coverage areas</span>
        </article>
        <article className="card coverage-summary-card">
          <div className="badge card-badge">Customer Access</div>
          <strong className="coverage-summary-value">24/7</strong>
          <span>portal and ticket access online</span>
        </article>
        <article className="card coverage-summary-card">
          <div className="badge card-badge">Address Check</div>
          <strong className="coverage-summary-value">Direct</strong>
          <span>availability confirmed for your exact location</span>
        </article>
      </div>

      <div className="coverage-section-heading">
        <div>
          <div className="badge card-badge">Service Areas</div>
          <h2>Which areas does Centrum currently list?</h2>
          <p className="page-intro">
            The active list below is the current published coverage list. A
            listed village or region does not guarantee every street or
            building, so Centrum still confirms the exact address before
            activation.
          </p>
        </div>
      </div>

      {coverageLoading && noVisibleAreas ? (
        <AsyncState
          kind="loading"
          eyebrow="Service Areas"
          title="Loading coverage areas"
          message="Checking the latest published coverage list."
        />
      ) : coverageError && noVisibleAreas ? (
        <AsyncState
          kind="error"
          eyebrow="Coverage Unavailable"
          title="We couldn't load the coverage list"
          message={coverageError}
          onRetry={() => void fetchCoverageRegions(true)}
          href="/contact"
          hrefLabel="Ask About My Address"
        />
      ) : (
        <>
          {coverageError ? (
            <p className="form-alert form-alert-error">
              {coverageError}{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => void fetchCoverageRegions(false)}
              >
                Retry
              </button>
            </p>
          ) : null}

          <div className="coverage-area-grid">
            {areas.map((area) => (
              <article className="card coverage-area-card" key={area.id}>
                <span className="coverage-area-dot" aria-hidden="true" />
                <div>
                  <h2>{area.name}</h2>
                  <p>
                    {area.description ||
                      "Contact Centrum Service to confirm availability at your exact address."}
                  </p>
                </div>
              </article>
            ))}
            {noVisibleAreas ? (
              <article className="card coverage-area-card">
                <div>
                  <h2>Coverage list is being updated</h2>
                  <p>
                    Contact Centrum Service and we'll confirm availability for
                    your address directly.
                  </p>
                </div>
              </article>
            ) : null}
          </div>
        </>
      )}

      <div className="coverage-info-grid">
        <article className="card coverage-info-card">
          <div className="badge card-badge">How It Works</div>
          <h2>How do I check availability at my address?</h2>
          <p>
            Send your village and exact location. Centrum checks the nearest
            service area and practical installation route before confirming
            availability.
          </p>
          <ol className="coverage-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Send your location</strong>
                <p>Share your village, street, or map pin.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>We check availability</strong>
                <p>Centrum checks whether your exact location can be served.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Choose your plan</strong>
                <p>Once confirmed, select the plan that fits your needs.</p>
              </div>
            </li>
          </ol>
        </article>

        <article className="card coverage-info-card coverage-cta-card">
          <div className="badge card-badge">Not Listed?</div>
          <h2>Your area may still be worth checking</h2>
          <p>
            The published list is not a street-by-street guarantee. If you are
            nearby, send your exact location and Centrum can confirm whether
            service is currently possible.
          </p>
          <div className="section-actions">
            <Link href="/contact" className="btn btn-primary">
              Check My Address
            </Link>
            <Link href="/portal/register" className="btn btn-secondary">
              Create Account
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
