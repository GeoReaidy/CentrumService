'use client';

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ServiceCustomizationWizard } from "@/components/ServiceCustomizationWizard";
import { CentrumLoadingScreen } from "@/components/CentrumLoading";
import { useLanguage } from "@/components/LanguageProvider";
import { localizedField } from "@/lib/i18n";

type DbPlan = {
  id: number;
  name: string;
  name_fr: string | null;
  name_ar: string | null;
  description: string | null;
  description_fr: string | null;
  description_ar: string | null;
  speed_down_mbps: number | null;
  speed_up_mbps: number | null;
  monthly_quota_gb: number | null;
  monthly_price_usd: number;
  is_active: boolean;
};

export default function PlansPage() {
  const supabase = getSupabaseBrowserClient();
  const { locale } = useLanguage();
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
      .select("id,name,name_fr,name_ar,description,description_fr,description_ar,speed_down_mbps,speed_up_mbps,monthly_quota_gb,monthly_price_usd,is_active")
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
    return <CentrumLoadingScreen context="Internet Plans" message="Loading Centrum’s active plans." />;
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
          plans={plans.map((plan) => ({
            ...plan,
            name: localizedField(plan as unknown as Record<string, unknown>, "name", locale),
            description: localizedField(plan as unknown as Record<string, unknown>, "description", locale) || null,
          }))}
        />
      </div>

      <div className="section-grid plans-grid">
        {plans.map((plan) => (
          <article className="card" key={plan.id}>
            <div className="badge card-badge">Service Plan</div>
            <h2>{localizedField(plan as unknown as Record<string, unknown>, "name", locale)}</h2>
            {localizedField(plan as unknown as Record<string, unknown>, "description", locale) ? <p className="plan-description">{localizedField(plan as unknown as Record<string, unknown>, "description", locale)}</p> : null}

            {plan.speed_down_mbps !== null || plan.speed_up_mbps !== null ? (
              <div className="tech-stats" style={{ gap: "1rem", marginTop: "1rem", border: "none", paddingTop: "0" }}>
                {plan.speed_down_mbps !== null ? (
                  <div className="stat-item">
                    <span className="stat-value">{plan.speed_down_mbps}</span>
                    <span className="stat-label">Down Mbps</span>
                  </div>
                ) : null}
                {plan.speed_up_mbps !== null ? (
                  <div className="stat-item">
                    <span className="stat-value">{plan.speed_up_mbps}</span>
                    <span className="stat-label">Up Mbps</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
              {plan.monthly_quota_gb !== null ? <p><strong>Monthly Quota:</strong> {plan.monthly_quota_gb} GB</p> : null}
              <p><strong>Cost:</strong> <span className="stat-value" style={{ fontSize: "1.2rem" }}>${plan.monthly_price_usd}</span><span style={{ color: "var(--muted)" }}>/month</span></p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
