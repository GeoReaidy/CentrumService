'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { LocationCapture, type CapturedLocation } from "@/components/LocationCapture";
import { useLanguage } from "@/components/LanguageProvider";
import { localizedField } from "@/lib/i18n";

export type CustomizationPlan = {
  id: number;
  name: string;
  name_fr?: string | null;
  name_ar?: string | null;
  monthly_price_usd?: number;
};

type WizardDefaults = {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  preferredPlanId?: number | null;
  location?: CapturedLocation | null;
};

type ServiceCustomizationWizardProps = {
  triggerLabel?: string;
  triggerClassName?: string;
  plans?: CustomizationPlan[];
  defaults?: WizardDefaults;
  openInitially?: boolean;
  onSubmitted?: () => void;
};

const usageChoices = [
  "Gaming",
  "Streaming / TV",
  "Remote work",
  "Study / classes",
  "Security cameras",
  "Social media",
  "General browsing",
];

const budgetChoices = ["Under $20", "$20–$30", "$30–$50", "$50+", "Not sure yet"];

export function ServiceCustomizationWizard({
  triggerLabel = "Help Me Customize My Service",
  triggerClassName = "btn btn-secondary",
  plans: providedPlans,
  defaults,
  openInitially = false,
  onSubmitted,
}: ServiceCustomizationWizardProps) {
  const supabase = getSupabaseBrowserClient();
  const { locale } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(openInitially);
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<CustomizationPlan[]>(providedPlans ?? []);
  const [fullName, setFullName] = useState(defaults?.fullName ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [address, setAddress] = useState(defaults?.address ?? "");
  const [location, setLocation] = useState<CapturedLocation | null>(defaults?.location ?? null);
  const [serviceType, setServiceType] = useState("home");
  const [peopleCount, setPeopleCount] = useState("1-2");
  const [deviceCount, setDeviceCount] = useState("1-5");
  const [usage, setUsage] = useState<string[]>([]);
  const [budget, setBudget] = useState("Not sure yet");
  const [preferredPlanId, setPreferredPlanId] = useState(defaults?.preferredPlanId ? String(defaults.preferredPlanId) : "");
  const [currentProvider, setCurrentProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || providedPlans?.length || !supabase) return;
    let active = true;
    void supabase
      .from("plans")
      .select("id,name,name_fr,name_ar,monthly_price_usd")
      .eq("is_active", true)
      .order("monthly_price_usd", { ascending: true })
      .then(({ data }) => {
        if (active) {
          const rows = (data as CustomizationPlan[] | null) ?? [];
          setPlans(rows.map((plan) => ({
            ...plan,
            name: localizedField(plan as unknown as Record<string, unknown>, "name", locale),
          })));
        }
      });
    return () => { active = false; };
  }, [locale, open, providedPlans, supabase]);

  useEffect(() => {
    if (providedPlans?.length) setPlans(providedPlans);
  }, [providedPlans]);

  useEffect(() => {
    if (!open) return;
    setFullName((value) => value || defaults?.fullName || "");
    setEmail((value) => value || defaults?.email || "");
    setPhone((value) => value || defaults?.phone || "");
    setAddress((value) => value || defaults?.address || "");
    setLocation((value) => value ?? defaults?.location ?? null);
    if (defaults?.preferredPlanId) setPreferredPlanId(String(defaults.preferredPlanId));
  }, [defaults, open]);

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, submitting]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === preferredPlanId) ?? null,
    [plans, preferredPlanId],
  );

  function toggleUsage(choice: string) {
    setUsage((current) => current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice]);
  }

  function closeWizard() {
    if (submitting) return;
    setOpen(false);
    setStep(0);
    setError("");
  }

  function nextStep() {
    setError("");
    if (step === 0 && (!fullName.trim() || !email.trim())) {
      setError("Please provide your name and email so Centrum can follow up with you.");
      return;
    }
    if (step === 1 && usage.length === 0) {
      setError("Choose at least one way you use your internet connection.");
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!baseUrl) throw new Error("Supabase is not configured for this website.");

      const headers: Record<string, string> = { "content-type": "application/json" };
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) headers.authorization = `Bearer ${data.session.access_token}`;
      }

      const response = await fetch(`${baseUrl}/functions/v1/service-customization`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          location_latitude: location?.latitude ?? null,
          location_longitude: location?.longitude ?? null,
          location_accuracy_m: location?.accuracyM ?? null,
          location_captured_at: location?.capturedAt ?? null,
          service_type: serviceType,
          people_count: peopleCount,
          device_count: deviceCount,
          usage_types: usage,
          budget_range: budget,
          preferred_plan_id: preferredPlanId ? Number(preferredPlanId) : null,
          preferred_plan_name: selectedPlan?.name ?? null,
          current_provider: currentProvider.trim() || null,
          notes: notes.trim() || null,
          website: "",
        }),
      });

      const result = await response.json().catch(() => ({})) as { error?: string; email_sent?: boolean };
      if (!response.ok) throw new Error(result.error || "Could not submit your customization request.");

      setSuccess(result.email_sent === false
        ? "Your request was saved for the Centrum team. Email delivery still needs to be configured by the administrator."
        : "Your request was sent to the Centrum team. They can now recommend the best setup for you.");
      setStep(4);
      onSubmitted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  const wizard = open ? (
    <div
      className="wizard-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeWizard();
      }}
    >
      <section className="wizard-dialog" role="dialog" aria-modal="true" aria-labelledby="customize-title">
        <div className="wizard-header">
          <div>
            <span className="badge card-badge">Service Match</span>
            <h2 id="customize-title">Help Me Customize My Service</h2>
            <p>Tell Centrum how you actually use the internet. This is optional and does not change your account automatically.</p>
          </div>
          <button type="button" className="wizard-close" onClick={closeWizard} aria-label="Close customization wizard">×</button>
        </div>

        {step < 4 ? (
          <div className="wizard-progress" aria-label={`Step ${step + 1} of 4`}>
            {[0, 1, 2, 3].map((item) => <span className={item <= step ? "active" : ""} key={item} />)}
          </div>
        ) : null}

        <form onSubmit={submitRequest} className="wizard-body">
          {step === 0 ? (
            <div className="wizard-step">
              <div className="wizard-step-heading"><span>1</span><div><h3>Where should we reach you?</h3><p>Used only to prepare and follow up on this recommendation.</p></div></div>
              <div className="form-two-col">
                <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></label>
                <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="Optional" /></label>
                <label>Service address<input value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" placeholder="Village / street / building" /></label>
              </div>
              <LocationCapture
                value={location}
                onChange={setLocation}
                title="Service location (optional)"
                description="Attach the exact installation/service point to this recommendation so Centrum can check coverage and plan the setup."
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="wizard-step">
              <div className="wizard-step-heading"><span>2</span><div><h3>How will you use the connection?</h3><p>This helps separate a light household from a gaming, work, or camera-heavy setup.</p></div></div>
              <div className="form-two-col">
                <label>Service type<select value={serviceType} onChange={(event) => setServiceType(event.target.value)}><option value="home">Home</option><option value="business">Business</option><option value="home_business">Home + business</option></select></label>
                <label>People / regular users<select value={peopleCount} onChange={(event) => setPeopleCount(event.target.value)}><option>1-2</option><option>3-4</option><option>5-7</option><option>8+</option></select></label>
                <label>Connected devices<select value={deviceCount} onChange={(event) => setDeviceCount(event.target.value)}><option>1-5</option><option>6-10</option><option>11-20</option><option>20+</option></select></label>
              </div>
              <div className="wizard-choice-grid">
                {usageChoices.map((choice) => (
                  <button type="button" key={choice} className={`wizard-choice ${usage.includes(choice) ? "selected" : ""}`} onClick={() => toggleUsage(choice)}>{usage.includes(choice) ? "✓ " : ""}{choice}</button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="wizard-step">
              <div className="wizard-step-heading"><span>3</span><div><h3>Budget and plan preference</h3><p>You can pick a plan you already like, or leave the final recommendation to Centrum.</p></div></div>
              <div className="form-two-col">
                <label>Approximate monthly budget<select value={budget} onChange={(event) => setBudget(event.target.value)}>{budgetChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label>
                <label>Plan you are interested in<select value={preferredPlanId} onChange={(event) => setPreferredPlanId(event.target.value)}><option value="">Recommend one for me</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}{plan.monthly_price_usd !== undefined ? ` · $${plan.monthly_price_usd}/mo` : ""}</option>)}</select></label>
                <label>Current provider / setup<input value={currentProvider} onChange={(event) => setCurrentProvider(event.target.value)} placeholder="Optional" /></label>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="wizard-step">
              <div className="wizard-step-heading"><span>4</span><div><h3>Review your request</h3><p>Nothing is activated or billed from this form. Centrum will contact you before making service changes.</p></div></div>
              <div className="wizard-review">
                <div><span>Customer</span><strong>{fullName}</strong><small>{email}{phone ? ` · ${phone}` : ""}</small></div>
                <div><span>Service</span><strong>{serviceType.replaceAll("_", " ")}</strong><small>{peopleCount} users · {deviceCount} devices</small></div>
                <div><span>Usage</span><strong>{usage.join(", ")}</strong></div>
                <div><span>Preference</span><strong>{selectedPlan?.name ?? "Recommend a plan"}</strong><small>{budget}</small></div>
                {location ? <div><span>Location</span><strong>Attached</strong><small>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</small></div> : null}
              </div>
              <label>Anything else we should know?<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Coverage concerns, gaming latency, work requirements, cameras, installation timing..." /></label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="wizard-success">
              <span className="wizard-success-icon">✓</span>
              <h3>Request received</h3>
              <p>{success}</p>
              <button type="button" className="btn btn-primary" onClick={closeWizard}>Done</button>
            </div>
          ) : null}

          {error ? <p className="form-alert form-alert-error">{error}</p> : null}

          {step < 4 ? (
            <div className="wizard-actions">
              {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }}>Back</button> : <span />}
              {step < 3 ? <button type="button" className="btn btn-primary" onClick={nextStep}>Continue</button> : <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Sending..." : "Send My Request"}</button>}
            </div>
          ) : null}
        </form>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => { setOpen(true); setError(""); }}>
        {triggerLabel}
      </button>
      {mounted && wizard ? createPortal(wizard, document.body) : null}
    </>
  );
}
