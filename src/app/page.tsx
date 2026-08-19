'use client';

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { derivePublicNetworkStatus, settingIsEnabled, statusSlug } from "@/lib/network-monitoring";

type DbPlan = {
  id: number;
  name: string;
  speed_down_mbps: number;
  speed_up_mbps: number;
  monthly_price_usd: number;
};

type CoverageRegion = {
  id: number;
  name: string;
};

export default function HomePage() {
  const supabase = getSupabaseBrowserClient();

  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(() => Boolean(supabase));

  const [networkStatus, setNetworkStatus] = useState("Monitoring Pending");
  const [coverageAreas, setCoverageAreas] = useState<CoverageRegion[]>([]);

  /*
   * NETWORK STATUS
   * Automatically reported by the monitoring router through Supabase.
   * Global maintenance remains the only manual override.
   */
  const fetchNetworkStatus = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
        .from("system_settings")
        .select("key,value")
        .in("key", ["network_status", "global_maintenance", "monitor_heartbeat_at"]);

    if (!error) {
      const settings = new Map((data ?? []).map((row) => [row.key, row.value]));
      setNetworkStatus(derivePublicNetworkStatus(
          settings.get("network_status"),
          settingIsEnabled(settings.get("global_maintenance")),
          settings.get("monitor_heartbeat_at"),
      ));
    }
  }, [supabase]);

  /*
   * COVERAGE
   * Controlled by the admin panel through coverage_regions.
   */
  const fetchCoverageAreas = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
        .from("coverage_regions")
        .select("id,name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (!error) {
      setCoverageAreas(
          (data as CoverageRegion[] | null) ?? []
      );
    }
  }, [supabase]);

  /*
   * PLANS
   */
  useEffect(() => {
    if (!supabase) {
      setPlansLoading(false);
      return;
    }

    let mounted = true;

    void supabase
        .from("plans")
        .select(
            "id,name,speed_down_mbps,speed_up_mbps,monthly_price_usd"
        )
        .eq("is_active", true)
        .order("monthly_price_usd", { ascending: true })
        .limit(3)
        .then(({ data }) => {
          if (!mounted) return;

          setPlans((data as DbPlan[] | null) ?? []);
          setPlansLoading(false);
        });

    return () => {
      mounted = false;
    };
  }, [supabase]);

  /*
   * Keep public network/coverage information updated.
   */
  useEffect(() => {
    if (!supabase) return;

    void fetchNetworkStatus();
    void fetchCoverageAreas();

    const interval = window.setInterval(() => {
      void fetchNetworkStatus();
      void fetchCoverageAreas();
    }, 15000);

    const onFocus = () => {
      void fetchNetworkStatus();
      void fetchCoverageAreas();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [
    fetchCoverageAreas,
    fetchNetworkStatus,
    supabase,
  ]);

  return (
      <div className="animate-fade-in">

        {/* =====================================================
          HERO
      ===================================================== */}

        <section className="hero">

          <div
              className={`badge badge-pulse page-badge home-status-${statusSlug(
                  networkStatus
              )}`}
          >
            Network Status: {networkStatus}
          </div>

          <h1>
            Fiber-fast internet across North Bekaa
          </h1>

          <p>
            Centrum Service keeps your home and business connected
            with reliable, high-speed internet backed by a real
            local support team — day and night.
          </p>

          <div className="cta-row">
            <Link href="/plans" className="btn btn-primary">
              View Plans
            </Link>

            <Link
                href="/portal/register"
                className="btn btn-secondary"
            >
              Create Account
            </Link>
          </div>

          <div className="tech-stats">

            <div className="stat-item">
              <span className="stat-value">99.9%</span>
              <span className="stat-label">Uptime</span>
            </div>

            <div className="stat-item">
              <span className="stat-value">24/7</span>
              <span className="stat-label">Support</span>
            </div>

            <div className="stat-item">
            <span className="stat-value">
              {coverageAreas.length}+
            </span>

              <span className="stat-label">
              Areas Covered
            </span>
            </div>

          </div>
        </section>


        {/* =====================================================
          WHY CENTRUM
      ===================================================== */}

        <section style={{ marginTop: "2.5rem" }}>

          <div className="badge card-badge">
            Why Centrum
          </div>

          <h2
              style={{
                marginTop: "0.5rem",
                marginBottom: "0.5rem",
              }}
          >
            Built for the Bekaa
          </h2>

          <p className="page-intro">
            A network designed and maintained locally, so problems
            get solved fast.
          </p>

          <div
              className="section-grid"
              style={{ marginTop: "1.5rem" }}
          >

            <article className="card">

              <div className="badge card-badge">
                Speed
              </div>

              <h2>High-Speed Fiber</h2>

              <p>
                Stream, game, and work from home without buffering,
                with plans built for every household size.
              </p>

            </article>


            <article className="card">

              <div className="badge card-badge">
                Coverage
              </div>

              <h2>Local Network</h2>

              <p>
                Expanding across the Bekaa, village by village.
              </p>

            </article>


            <article className="card">

              <div className="badge card-badge">
                Support
              </div>

              <h2>Real Human Support</h2>

              <p>
                Open a ticket from your portal and track it live —
                no call centers, no runaround.
              </p>

            </article>

          </div>
        </section>


        {/* =====================================================
          COVERAGE + CONTACT
      ===================================================== */}

        <section style={{ marginTop: "2.5rem" }}>

          <div
              className="section-grid"
              style={{
                gridTemplateColumns:
                    "repeat(auto-fit, minmax(280px, 1fr))",
              }}
          >

            <article className="card">

              <div className="badge card-badge">
                Service Nodes
              </div>

              <h2>Coverage Areas</h2>

              <ul
                  className="simple-list"
                  style={{ marginTop: "1rem" }}
              >

                {coverageAreas.map((area) => (
                    <li key={area.id}>
                      {area.name}
                    </li>
                ))}

                {!coverageAreas.length ? (
                    <li>
                      Coverage information is being updated.
                    </li>
                ) : null}

              </ul>

              <Link
                  href="/coverage"
                  className="text-link"
              >
                Full coverage details →
              </Link>

            </article>


            <article className="card">

              <div className="badge card-badge">
                Support Details
              </div>

              <h2>Contact Us</h2>

              <div
                  style={{
                    display: "grid",
                    gap: "0.65rem",
                    marginTop: "1rem",
                  }}
              >

                <p>
                  <strong>Phone:</strong>{" "}
                  <code
                      style={{
                        color: "var(--accent)",
                      }}
                  >
                    +961 03 822 947
                  </code>
                </p>

                <p>
                  <strong>Email:</strong>{" "}
                  <code
                      style={{
                        color: "var(--accent)",
                      }}
                  >
                    tonyreaidy@live.com
                  </code>
                </p>

                <p>
                  <strong>Hours:</strong>{" "}
                  Monday – Saturday, 08:00 – 18:00
                </p>

              </div>

              <div
                  className="section-actions"
                  style={{ marginTop: "1rem" }}
              >

                <Link
                    href="/contact"
                    className="btn btn-primary"
                >
                  Contact Us
                </Link>

                <Link
                    href="/portal/live-chat"
                    className="btn btn-secondary"
                >
                  Start Live Chat
                </Link>

              </div>

            </article>

          </div>
        </section>


        {/* =====================================================
          POPULAR PLANS
      ===================================================== */}

        <section style={{ marginTop: "2.5rem" }}>

          <div className="badge card-badge">
            Offerings
          </div>

          <h2
              style={{
                marginTop: "0.5rem",
                marginBottom: "0.5rem",
              }}
          >
            Popular Plans
          </h2>

          <p className="page-intro">
            A quick look at our connectivity tiers.
          </p>


          {!supabase ? (

              <p
                  className="page-intro"
                  style={{ marginTop: "1rem" }}
              >
                Plan pricing is not configured yet.
              </p>

          ) : plansLoading ? (

              <p
                  className="page-intro"
                  style={{ marginTop: "1rem" }}
              >
                Loading plans...
              </p>

          ) : plans.length === 0 ? (

              <p
                  className="page-intro"
                  style={{ marginTop: "1rem" }}
              >
                No active plans right now — check back soon.
              </p>

          ) : (

              <div
                  className="section-grid"
                  style={{ marginTop: "1.5rem" }}
              >

                {plans.map((plan) => (

                    <article
                        className="card"
                        key={plan.id}
                    >

                      <div className="badge card-badge">
                        Service Plan
                      </div>

                      <h2>{plan.name}</h2>

                      <div
                          className="tech-stats"
                          style={{
                            gap: "1rem",
                            marginTop: "1rem",
                            border: "none",
                            paddingTop: "0",
                          }}
                      >

                        <div className="stat-item">

                    <span className="stat-value">
                      {plan.speed_down_mbps}
                    </span>

                          <span className="stat-label">
                      Down Mbps
                    </span>

                        </div>


                        <div className="stat-item">

                    <span className="stat-value">
                      {plan.speed_up_mbps}
                    </span>

                          <span className="stat-label">
                      Up Mbps
                    </span>

                        </div>

                      </div>


                      <p style={{ marginTop: "1rem" }}>

                  <span
                      className="stat-value"
                      style={{
                        fontSize: "1.2rem",
                      }}
                  >
                    ${plan.monthly_price_usd}
                  </span>

                        <span
                            style={{
                              color: "var(--muted)",
                            }}
                        >
                    /month
                  </span>

                      </p>

                    </article>

                ))}

              </div>

          )}


          <div
              className="section-actions"
              style={{ marginTop: "1.5rem" }}
          >

            <Link
                href="/plans"
                className="btn btn-primary"
            >
              See All Plans
            </Link>

          </div>

        </section>


        {/* =====================================================
          CUSTOMER PORTAL
      ===================================================== */}

        <section style={{ marginTop: "2.5rem" }}>

          <article className="card">

            <div className="badge card-badge">
              Customer Portal
            </div>

            <h2>
              Manage your account online
            </h2>

            <p style={{ marginTop: "0.5rem" }}>
              View your plan, payments, service status,
              support tickets, service requests,
              announcements, and account updates from one
              place.
            </p>

            <div
                className="section-actions"
                style={{ marginTop: "1rem" }}
            >

              <Link
                  href="/portal/dashboard"
                  className="btn btn-primary"
              >
                Open Portal
              </Link>

              <Link
                  href="/portal/register"
                  className="btn btn-secondary"
              >
                Create an Account
              </Link>

            </div>

          </article>

        </section>

      </div>
  );
}