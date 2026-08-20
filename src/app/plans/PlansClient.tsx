"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ServiceCustomizationWizard } from "@/components/ServiceCustomizationWizard";
import { AsyncState } from "@/components/AsyncState";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import type { PublicPlan } from "@/lib/public-catalog-server";

type PlansClientProps = {
  initialPlans: PublicPlan[];
  initialLoadFailed: boolean;
};

export function PlansClient({
  initialPlans,
  initialLoadFailed,
}: PlansClientProps) {
  const supabase = getSupabaseBrowserClient();
  const [plans, setPlans] = useState<PublicPlan[]>(initialPlans);
  const [isLoading, setIsLoading] = useState(
    () => initialPlans.length === 0 && initialLoadFailed,
  );
  const [errorMessage, setErrorMessage] = useState(
    initialLoadFailed
      ? "We couldn't preload the current plans. We'll try again from your browser."
      : "",
  );

  const loadPlans = useCallback(
    async (showLoading = true) => {
      if (!supabase) {
        if (initialPlans.length === 0) {
          setErrorMessage("Plan information is temporarily unavailable.");
        }
        setIsLoading(false);
        return;
      }

      if (showLoading) setIsLoading(true);
      setErrorMessage("");

      try {
        const { data, error } = await supabase
          .from("plans")
          .select(
            "id,name,speed_down_mbps,speed_up_mbps,monthly_quota_gb,monthly_price_usd,is_active",
          )
          .eq("is_active", true)
          .order("monthly_price_usd", { ascending: true });

        if (error) throw error;
        setPlans((data as PublicPlan[] | null) ?? []);
      } catch (error) {
        console.error("Failed to refresh public plans", error);
        setErrorMessage(
          toFriendlyErrorMessage(
            error,
            "We couldn't refresh the current plans right now. Please try again.",
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [initialPlans.length, supabase],
  );

  useEffect(() => {
    // The server already put the published plan facts into the initial HTML.
    // Refresh quietly after hydration so admin changes still appear promptly.
    void loadPlans(initialLoadFailed && initialPlans.length === 0);
  }, [initialLoadFailed, initialPlans.length, loadPlans]);

  const noVisiblePlans = plans.length === 0;

  return (
    <section className="animate-fade-in plans-page">
      <div className="badge badge-pulse page-badge">Internet Plans · North Bekaa</div>
      <h1>Internet plans and pricing in North Bekaa</h1>
      <p className="page-intro">
        Compare Centrum Service's currently published download speeds, upload speeds,
        monthly quotas, and prices for homes and businesses.
      </p>

      {isLoading && noVisiblePlans ? (
        <AsyncState
          kind="loading"
          eyebrow="Internet Plans"
          title="Loading current plans"
          message="Checking Centrum's active service plans."
        />
      ) : errorMessage && noVisiblePlans ? (
        <AsyncState
          kind="error"
          eyebrow="Plans Unavailable"
          title="We couldn't load the plans"
          message={errorMessage}
          onRetry={() => void loadPlans(true)}
        />
      ) : noVisiblePlans ? (
        <AsyncState
          kind="empty"
          eyebrow="Internet Plans"
          title="No active plans are listed yet"
          message="Our plan list is being updated. Contact Centrum and we'll help you choose the right service."
          href="/contact"
          hrefLabel="Contact Centrum"
        />
      ) : (
        <>
          {errorMessage ? (
            <p className="form-alert form-alert-error">
              {errorMessage}{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => void loadPlans(false)}
              >
                Retry
              </button>
            </p>
          ) : null}

          <div className="plans-customization-callout">
            <div className="plans-customization-copy">
              <span className="badge card-badge">Need a recommendation?</span>
              <h2>Not sure which plan fits your home or business?</h2>
              <p>
                Tell us how many people and devices you have, what you use the
                connection for, and your budget. Centrum can recommend the most
                suitable published plan or setup.
              </p>
            </div>
            <ServiceCustomizationWizard
              triggerLabel="Help Me Customize My Plan"
              triggerClassName="btn btn-primary plans-customization-button"
              plans={plans}
            />
          </div>

          <div className="section-grid plans-grid">
            {plans.map((plan) => (
              <article className="card" key={plan.id}>
                <div className="badge card-badge">Service Plan</div>
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
                    <span className="stat-value">{plan.speed_down_mbps}</span>
                    <span className="stat-label">Down Mbps</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{plan.speed_up_mbps}</span>
                    <span className="stat-label">Up Mbps</span>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: "1rem",
                    display: "grid",
                    gap: "0.5rem",
                  }}
                >
                  <p>
                    <strong>Monthly Quota:</strong> {plan.monthly_quota_gb} GB
                  </p>
                  <p>
                    <strong>Cost:</strong>{" "}
                    <span className="stat-value" style={{ fontSize: "1.2rem" }}>
                      ${plan.monthly_price_usd}
                    </span>
                    <span style={{ color: "var(--muted)" }}>/month</span>
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="coverage-info-grid" style={{ marginTop: "1.5rem" }}>
            <article className="card coverage-info-card">
              <div className="badge card-badge">Before You Choose</div>
              <h2>What do the plan numbers mean?</h2>
              <p>
                Each card shows Centrum's currently published download profile,
                upload profile, monthly quota, and monthly price. Exact service
                availability still depends on your address.
              </p>
            </article>

            <article className="card coverage-info-card coverage-cta-card">
              <div className="badge card-badge">Need a precise answer?</div>
              <h2>Confirm the service available at your address</h2>
              <p>
                Fees, installation requirements, contract terms, post-quota
                handling, and the service profile available at a specific address
                should be confirmed with Centrum before activation.
              </p>
              <div className="section-actions">
                <a href="/contact" className="btn btn-primary">
                  Ask Centrum
                </a>
                <a href="/coverage" className="btn btn-secondary">
                  Check Coverage
                </a>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
