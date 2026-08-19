'use client';

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ServiceCustomizationWizard } from "@/components/ServiceCustomizationWizard";

type DbPlan = {
  id: number;
  name: string;
  speed_down_mbps: number;
  speed_up_mbps: number;
  monthly_quota_gb: number;
  monthly_price_usd: number;
  is_active: boolean;
};

export default function PlansPage() {
  const supabase = getSupabaseBrowserClient();
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    void supabase
      .from("plans")
      .select("id,name,speed_down_mbps,speed_up_mbps,monthly_quota_gb,monthly_price_usd,is_active")
      .eq("is_active", true)
      .order("monthly_price_usd", { ascending: true })
      .then(({ data, error }) => {
        if (!mounted) {
          return;
        }

        if (error) {
          setErrorMessage(error.message);
          setIsLoading(false);
          return;
        }

        setPlans((data as DbPlan[] | null) ?? []);
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [supabase]);

  if (!supabase) {
    return (
      <section>
        <h1>Internet Plans</h1>
        <p className="page-intro">Supabase is not configured yet.</p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section>
        <h1>Internet Plans</h1>
        <p className="page-intro">Loading active plans...</p>
      </section>
    );
  }

  return (
    <section className="animate-fade-in plans-page">
      <div className="badge badge-pulse page-badge">Offerings: Updated</div>
      <h1>Connectivity Tiers</h1>
      <p className="page-intro">Choose the bandwidth profile that fits your digital lifestyle.</p>
      {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}

      <div className="plans-customization-callout">
        <div className="plans-customization-copy">
          <span className="badge card-badge">Need a recommendation?</span>
          <h2>Not sure which plan fits your home or business?</h2>
          <p>Tell us how many people and devices you have, what you use the connection for, and your budget. Centrum can recommend the most suitable setup.</p>
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

            <div className="tech-stats" style={{ gap: "1rem", marginTop: "1rem", border: "none", paddingTop: "0" }}>
              <div className="stat-item">
                <span className="stat-value">{plan.speed_down_mbps}</span>
                <span className="stat-label">Down Mbps</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{plan.speed_up_mbps}</span>
                <span className="stat-label">Up Mbps</span>
              </div>
            </div>

            <div style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
              <p><strong>Monthly Quota:</strong> {plan.monthly_quota_gb} GB</p>
              <p><strong>Cost:</strong> <span className="stat-value" style={{ fontSize: "1.2rem" }}>${plan.monthly_price_usd}</span><span style={{ color: "var(--muted)" }}>/month</span></p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
