"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AsyncState } from "@/components/AsyncState";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";

type PeriodPreset = "daily" | "weekly" | "monthly" | "yearly" | "custom";
type BucketMode = Exclude<PeriodPreset, "custom">;
type CollectionFilter = "all" | "paid" | "partial" | "unpaid";

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  plan_id: number | null;
  service_status: string;
  renewal_date: string | null;
};

type Plan = {
  id: number;
  name: string;
  monthly_price_usd: number;
};

type Payment = {
  id: number;
  customer_id: string | null;
  amount_usd: number;
  paid_at: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
};

type ChartPoint = {
  key: string;
  label: string;
  amount: number;
};

const pageSize = 1000;

export default function AdminRevenuePage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [periodPayments, setPeriodPayments] = useState<Payment[]>([]);
  const [monthPayments, setMonthPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<PeriodPreset>("monthly");
  const [customStart, setCustomStart] = useState(() => toDateInput(firstDayOfMonth(new Date())));
  const [customEnd, setCustomEnd] = useState(() => toDateInput(new Date()));
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("all");
  const [customerSearch, setCustomerSearch] = useState("");

  const periodRange = useMemo(
    () => resolvePeriodRange(preset, customStart, customEnd),
    [customEnd, customStart, preset],
  );

  const fetchPaymentRange = useCallback(async (start: Date, end: Date) => {
    if (!supabase) return [] as Payment[];
    const rows: Payment[] = [];
    let from = 0;

    while (true) {
      const { data, error: paymentError } = await supabase
        .from("payments")
        .select("id,customer_id,amount_usd,paid_at,payment_method,reference,notes")
        .gte("paid_at", start.toISOString())
        .lte("paid_at", end.toISOString())
        .order("paid_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (paymentError) throw paymentError;
      const batch = (data as Payment[] | null) ?? [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  }, [supabase]);

  const fetchReferenceData = useCallback(async () => {
    if (!supabase) return;
    const [customersResult, plansResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,phone,plan_id,service_status,renewal_date")
        .eq("role", "customer")
        .order("full_name", { ascending: true })
        .limit(5000),
      supabase
        .from("plans")
        .select("id,name,monthly_price_usd")
        .order("monthly_price_usd", { ascending: true }),
    ]);

    const firstError = customersResult.error || plansResult.error;
    if (firstError) throw firstError;

    setCustomers((customersResult.data as Customer[] | null) ?? []);
    setPlans((plansResult.data as Plan[] | null) ?? []);
  }, [supabase]);

  const refreshFinanceData = useCallback(async () => {
    if (!periodRange || !supabase) return;
    setPaymentsLoading(true);
    setError("");

    try {
      const monthStart = firstDayOfMonth(new Date());
      const monthEnd = endOfDay(new Date());
      const sameRange = periodRange.start.getTime() === monthStart.getTime()
        && periodRange.end.getTime() === monthEnd.getTime();

      if (sameRange) {
        const rows = await fetchPaymentRange(periodRange.start, periodRange.end);
        setPeriodPayments(rows);
        setMonthPayments(rows);
      } else {
        const [periodRows, currentMonthRows] = await Promise.all([
          fetchPaymentRange(periodRange.start, periodRange.end),
          fetchPaymentRange(monthStart, monthEnd),
        ]);
        setPeriodPayments(periodRows);
        setMonthPayments(currentMonthRows);
      }
    } catch (cause) {
      console.error("Revenue dashboard payment load failed", cause);
      setError(toFriendlyErrorMessage(cause, "Revenue data could not be loaded right now."));
    } finally {
      setPaymentsLoading(false);
    }
  }, [fetchPaymentRange, periodRange, supabase]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    async function boot() {
      const { data, error: authError } = await supabase!.auth.getUser();
      if (!mounted) return;

      if (authError || !data.user) {
        setLoading(false);
        router.replace("/portal/login");
        return;
      }

      const admin = await resolveIsAdmin(supabase!, data.user);
      if (!mounted) return;

      if (!admin) {
        setLoading(false);
        router.replace("/portal");
        return;
      }

      try {
        setAccount(data.user);
        await fetchReferenceData();
      } catch (cause) {
        console.error("Revenue dashboard reference data load failed", cause);
        setError(toFriendlyErrorMessage(cause, "Revenue data could not be loaded right now."));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void boot();
    return () => { mounted = false; };
  }, [fetchReferenceData, router, supabase]);

  useEffect(() => {
    if (!account || !periodRange) return;
    void refreshFinanceData();
  }, [account, periodRange, refreshFinanceData]);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);

  const billableCustomers = useMemo(
    () => customers.filter((customer) => customer.plan_id !== null && customer.service_status !== "pending_installation"),
    [customers],
  );

  const periodRevenue = useMemo(
    () => periodPayments.reduce((sum, payment) => sum + Number(payment.amount_usd || 0), 0),
    [periodPayments],
  );

  const periodPayers = useMemo(
    () => new Set(periodPayments.map((payment) => payment.customer_id).filter((id): id is string => Boolean(id))),
    [periodPayments],
  );

  const methodBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const payment of periodPayments) {
      const key = payment.payment_method || "other";
      totals.set(key, (totals.get(key) ?? 0) + Number(payment.amount_usd || 0));
    }
    return [...totals.entries()]
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [periodPayments]);

  const monthPaymentByCustomer = useMemo(() => {
    const totals = new Map<string, { amount: number; lastPaidAt: string | null }>();
    for (const payment of monthPayments) {
      if (!payment.customer_id) continue;
      const current = totals.get(payment.customer_id) ?? { amount: 0, lastPaidAt: null };
      current.amount += Number(payment.amount_usd || 0);
      if (!current.lastPaidAt || new Date(payment.paid_at) > new Date(current.lastPaidAt)) current.lastPaidAt = payment.paid_at;
      totals.set(payment.customer_id, current);
    }
    return totals;
  }, [monthPayments]);

  const collectionRows = useMemo(() => {
    return billableCustomers.map((customer) => {
      const plan = customer.plan_id === null ? null : planMap.get(customer.plan_id) ?? null;
      const expected = Number(plan?.monthly_price_usd ?? 0);
      const paid = Number(monthPaymentByCustomer.get(customer.id)?.amount ?? 0);
      const remaining = Math.max(expected - paid, 0);
      const status: Exclude<CollectionFilter, "all"> = expected <= 0 ? "paid" : paid <= 0 ? "unpaid" : remaining > 0.005 ? "partial" : "paid";
      return {
        customer,
        plan,
        expected,
        paid,
        remaining,
        status,
        lastPaidAt: monthPaymentByCustomer.get(customer.id)?.lastPaidAt ?? null,
      };
    });
  }, [billableCustomers, monthPaymentByCustomer, planMap]);

  const currentMonthRevenue = useMemo(
    () => monthPayments.reduce((sum, payment) => sum + Number(payment.amount_usd || 0), 0),
    [monthPayments],
  );

  const expectedMonthlyRevenue = useMemo(
    () => collectionRows.reduce((sum, row) => sum + row.expected, 0),
    [collectionRows],
  );

  const outstandingEstimate = useMemo(
    () => collectionRows.reduce((sum, row) => sum + row.remaining, 0),
    [collectionRows],
  );

  const paidCount = collectionRows.filter((row) => row.status === "paid").length;
  const partialCount = collectionRows.filter((row) => row.status === "partial").length;
  const unpaidCount = collectionRows.filter((row) => row.status === "unpaid").length;
  const collectionRate = expectedMonthlyRevenue > 0
    ? Math.min(100, (collectionRows.reduce((sum, row) => sum + Math.min(row.paid, row.expected), 0) / expectedMonthlyRevenue) * 100)
    : 0;

  const visibleCollectionRows = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return collectionRows.filter((row) => {
      if (collectionFilter !== "all" && row.status !== collectionFilter) return false;
      if (!query) return true;
      const customerName = row.customer.full_name?.toLowerCase() ?? "";
      const phone = row.customer.phone?.toLowerCase() ?? "";
      const planName = row.plan?.name.toLowerCase() ?? "";
      return customerName.includes(query)
        || phone.includes(query)
        || planName.includes(query)
        || row.customer.id.toLowerCase().includes(query);
    });
  }, [collectionFilter, collectionRows, customerSearch]);

  const chartBucketMode = useMemo(() => {
    if (!periodRange) return "monthly" as BucketMode;
    if (preset !== "custom") return preset;
    const days = Math.max(1, Math.ceil((periodRange.end.getTime() - periodRange.start.getTime()) / 86_400_000));
    if (days <= 45) return "daily";
    if (days <= 240) return "weekly";
    if (days <= 1095) return "monthly";
    return "yearly";
  }, [periodRange, preset]);

  const chartPoints = useMemo(() => {
    if (!periodRange) return [] as ChartPoint[];
    return buildChartPoints(periodPayments, periodRange.start, periodRange.end, chartBucketMode);
  }, [chartBucketMode, periodPayments, periodRange]);

  function exportPeriodCsv() {
    if (!periodRange) return;
    const rows = [
      ["paid_at", "customer", "customer_id", "amount_usd", "payment_method", "reference", "notes"],
      ...periodPayments.map((payment) => {
        const customer = payment.customer_id ? customerMap.get(payment.customer_id) : null;
        return [
          payment.paid_at,
          customer?.full_name ?? "Deleted / unlinked customer",
          payment.customer_id ?? "",
          Number(payment.amount_usd || 0).toFixed(2),
          payment.payment_method,
          payment.reference ?? "",
          payment.notes ?? "",
        ];
      }),
    ];
    downloadCsv(`centrum-revenue-${toDateInput(periodRange.start)}-to-${toDateInput(periodRange.end)}.csv`, rows);
  }

  function exportCollectionsCsv() {
    const rows = [
      ["customer", "customer_id", "phone", "plan", "monthly_charge_usd", "paid_this_month_usd", "remaining_usd", "renewal_date", "collection_status"],
      ...collectionRows.map((row) => [
        row.customer.full_name ?? "Customer",
        row.customer.id,
        row.customer.phone ?? "",
        row.plan?.name ?? "No plan",
        row.expected.toFixed(2),
        row.paid.toFixed(2),
        row.remaining.toFixed(2),
        row.customer.renewal_date ?? "",
        row.status,
      ]),
    ];
    downloadCsv(`centrum-collections-${toDateInput(new Date())}.csv`, rows);
  }

  if (loading) {
    return <section className="admin-page"><AsyncState kind="loading" eyebrow="Finance" title="Opening Revenue & Collections" message="Checking administrator access and loading customer billing data." /></section>;
  }

  if (!supabase) {
    return <section className="admin-page"><AsyncState kind="error" eyebrow="Finance" title="Revenue dashboard is unavailable" message="Centrum couldn't connect to the backend." /></section>;
  }

  if (!account) return null;

  return (
    <section className="animate-fade-in admin-page revenue-page">
      <div className="admin-header revenue-header">
        <div>
          <div className="badge badge-pulse page-badge">Administrator Finance</div>
          <h1>Revenue & Collections</h1>
          <p className="page-intro">Track collected revenue, current-month payment coverage, and exactly which customer accounts still need follow-up.</p>
        </div>
        <div className="section-actions">
          <Link href="/admin/operations?workspace=payments" className="btn btn-secondary">Payment Entry</Link>
          <Link href="/admin" className="btn btn-secondary">Back to Admin</Link>
        </div>
      </div>

      {error ? <AsyncState kind="error" eyebrow="Finance Data" title="Revenue data needs another try" message={error} onRetry={() => void refreshFinanceData()} retryLabel="Retry Revenue Data" /> : null}

      <div className="revenue-summary-grid">
        <article className="card revenue-kpi-card">
          <span className="admin-overview-label">This Month Collected</span>
          <strong>${currentMonthRevenue.toFixed(2)}</strong>
          <small>{monthPayments.length} payment{monthPayments.length === 1 ? "" : "s"} recorded this month.</small>
        </article>
        <article className="card revenue-kpi-card">
          <span className="admin-overview-label">Expected Monthly Revenue</span>
          <strong>${expectedMonthlyRevenue.toFixed(2)}</strong>
          <small>Based on assigned monthly plan prices for {collectionRows.length} billable customer{collectionRows.length === 1 ? "" : "s"}.</small>
        </article>
        <article className="card revenue-kpi-card">
          <span className="admin-overview-label">Estimated Outstanding</span>
          <strong>${outstandingEstimate.toFixed(2)}</strong>
          <small>{unpaidCount} unpaid · {partialCount} partial this month.</small>
        </article>
        <article className="card revenue-kpi-card">
          <span className="admin-overview-label">Collection Coverage</span>
          <strong>{collectionRate.toFixed(0)}%</strong>
          <small>{paidCount} fully paid of {collectionRows.length} billable accounts.</small>
        </article>
      </div>

      <article className="card revenue-chart-card">
        <div className="revenue-section-heading">
          <div>
            <div className="badge card-badge">Revenue Timeline</div>
            <h2>Collected revenue over time</h2>
            <p className="page-intro">{periodRange ? `${formatDate(periodRange.start)} – ${formatDate(periodRange.end)}` : "Choose a valid period."}</p>
          </div>
          <div className="revenue-chart-actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={exportPeriodCsv} disabled={!periodPayments.length}>Export Period CSV</button>
            <span className="status-pill status-active">${periodRevenue.toFixed(2)} collected</span>
          </div>
        </div>

        <div className="revenue-period-tabs" role="group" aria-label="Revenue graph period">
          {(["daily", "weekly", "monthly", "yearly", "custom"] as PeriodPreset[]).map((item) => (
            <button
              type="button"
              key={item}
              className={`revenue-period-tab ${preset === item ? "is-active" : ""}`}
              onClick={() => setPreset(item)}
              aria-pressed={preset === item}
            >
              {formatStatus(item)}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="revenue-custom-range">
            <label>From<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
            <label>To<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          </div>
        ) : null}

        {!periodRange ? (
          <p className="form-alert form-alert-error">Choose a valid custom date range. The end date cannot be before the start date.</p>
        ) : paymentsLoading ? (
          <div className="revenue-chart-loading"><span className="app-state-spinner" aria-hidden="true" /><span>Loading revenue data…</span></div>
        ) : (
          <RevenueChart points={chartPoints} />
        )}

        <div className="revenue-period-summary">
          <div><span>Collected</span><strong>${periodRevenue.toFixed(2)}</strong></div>
          <div><span>Transactions</span><strong>{periodPayments.length}</strong></div>
          <div><span>Customers paid</span><strong>{periodPayers.size}</strong></div>
          <div><span>Average payment</span><strong>${periodPayments.length ? (periodRevenue / periodPayments.length).toFixed(2) : "0.00"}</strong></div>
        </div>

        {methodBreakdown.length ? (
          <div className="revenue-method-grid">
            {methodBreakdown.map((item) => (
              <div key={item.method}><span>{formatStatus(item.method)}</span><strong>${item.amount.toFixed(2)}</strong></div>
            ))}
          </div>
        ) : null}
      </article>

      <article className="card collections-card">
        <div className="revenue-section-heading">
          <div>
            <div className="badge card-badge">Current Month Collections</div>
            <h2>Who paid and who still owes</h2>
            <p className="page-intro">Payment status below is based on the customer's assigned monthly plan price versus payments recorded during the current calendar month.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-compact" onClick={exportCollectionsCsv}>Export Collections CSV</button>
        </div>

        <div className="collections-filter-bar">
          <input className="admin-search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search customer, phone, plan or ID…" />
          <div className="collections-filter-tabs" role="group" aria-label="Collection status filter">
            <button type="button" className={collectionFilter === "all" ? "is-active" : ""} onClick={() => setCollectionFilter("all")}>All <span>{collectionRows.length}</span></button>
            <button type="button" className={collectionFilter === "paid" ? "is-active" : ""} onClick={() => setCollectionFilter("paid")}>Paid <span>{paidCount}</span></button>
            <button type="button" className={collectionFilter === "partial" ? "is-active" : ""} onClick={() => setCollectionFilter("partial")}>Partial <span>{partialCount}</span></button>
            <button type="button" className={collectionFilter === "unpaid" ? "is-active" : ""} onClick={() => setCollectionFilter("unpaid")}>Unpaid <span>{unpaidCount}</span></button>
          </div>
        </div>

        <div className="collections-table-wrap">
          <table className="collections-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Plan</th>
                <th>Monthly charge</th>
                <th>Paid this month</th>
                <th>Remaining</th>
                <th>Renewal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleCollectionRows.map((row) => (
                <tr key={row.customer.id}>
                  <td>
                    <strong>{row.customer.full_name || "Customer"}</strong>
                    <small>{row.customer.phone || row.customer.id.slice(0, 8)}</small>
                  </td>
                  <td>{row.plan?.name ?? "No plan"}</td>
                  <td>${row.expected.toFixed(2)}</td>
                  <td>
                    <strong>${row.paid.toFixed(2)}</strong>
                    {row.lastPaidAt ? <small>Last {formatDateTime(row.lastPaidAt)}</small> : null}
                  </td>
                  <td>${row.remaining.toFixed(2)}</td>
                  <td>
                    {row.customer.renewal_date ? formatDate(parseDateInput(row.customer.renewal_date)) : "Not set"}
                    {isPastDate(row.customer.renewal_date) ? <small className="collection-overdue">Overdue</small> : null}
                  </td>
                  <td><span className={`status-pill collection-status collection-status-${row.status}`}>{formatStatus(row.status)}</span></td>
                </tr>
              ))}
              {!visibleCollectionRows.length ? (
                <tr><td colSpan={7} className="empty-state">No customer accounts match this filter.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function RevenueChart({ points }: { points: ChartPoint[] }) {
  const width = 920;
  const height = 300;
  const left = 58;
  const right = 18;
  const top = 22;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxAmount = Math.max(0, ...points.map((point) => point.amount));
  const yMax = maxAmount > 0 ? niceCeiling(maxAmount) : 1;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const coords = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? left + plotWidth / 2 : left + index * xStep,
    y: top + plotHeight - (point.amount / yMax) * plotHeight,
  }));
  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const areaPath = coords.length
    ? `${linePath} L${coords[coords.length - 1].x.toFixed(2)},${(top + plotHeight).toFixed(2)} L${coords[0].x.toFixed(2)},${(top + plotHeight).toFixed(2)} Z`
    : "";
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  if (!points.length) return <div className="revenue-chart-empty">No payments were recorded in this period.</div>;

  return (
    <div className="revenue-chart-wrap" aria-label="Revenue over time chart">
      <svg className="revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        <title>Collected revenue over time</title>
        {ticks.map((fraction) => {
          const y = top + plotHeight - fraction * plotHeight;
          const value = yMax * fraction;
          return (
            <g key={fraction}>
              <line className="revenue-chart-gridline" x1={left} y1={y} x2={width - right} y2={y} />
              <text className="revenue-chart-y-label" x={left - 10} y={y + 4} textAnchor="end">${formatCompactMoney(value)}</text>
            </g>
          );
        })}
        {areaPath ? <path className="revenue-chart-area" d={areaPath} /> : null}
        {linePath ? <path className="revenue-chart-line" d={linePath} /> : null}
        {coords.map((point, index) => (
          <g key={point.key}>
            <circle className="revenue-chart-point" cx={point.x} cy={point.y} r={4}>
              <title>{point.label}: ${point.amount.toFixed(2)}</title>
            </circle>
            {(index % labelEvery === 0 || index === coords.length - 1) ? (
              <text className="revenue-chart-x-label" x={point.x} y={height - 17} textAnchor="middle">{point.label}</text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function resolvePeriodRange(preset: PeriodPreset, customStart: string, customEnd: string) {
  const now = new Date();
  const end = endOfDay(now);

  if (preset === "daily") return { start: startOfDay(addDays(now, -29)), end };
  if (preset === "weekly") return { start: startOfWeek(addDays(now, -77)), end };
  if (preset === "monthly") return { start: firstDayOfMonth(addMonths(now, -11)), end };
  if (preset === "yearly") return { start: new Date(now.getFullYear() - 4, 0, 1), end };

  if (!customStart || !customEnd) return null;
  const start = startOfDay(parseDateInput(customStart));
  const customEndDate = endOfDay(parseDateInput(customEnd));
  if (Number.isNaN(start.getTime()) || Number.isNaN(customEndDate.getTime()) || customEndDate < start) return null;
  return { start, end: customEndDate };
}

function buildChartPoints(payments: Payment[], start: Date, end: Date, mode: BucketMode): ChartPoint[] {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    const date = new Date(payment.paid_at);
    const key = bucketKey(date, mode);
    totals.set(key, (totals.get(key) ?? 0) + Number(payment.amount_usd || 0));
  }

  const points: ChartPoint[] = [];
  let cursor = bucketStart(start, mode);
  const final = bucketStart(end, mode);
  let safety = 0;

  while (cursor <= final && safety < 5000) {
    const key = bucketKey(cursor, mode);
    points.push({ key, label: bucketLabel(cursor, mode), amount: totals.get(key) ?? 0 });
    cursor = incrementBucket(cursor, mode);
    safety += 1;
  }

  return points;
}

function bucketStart(date: Date, mode: BucketMode) {
  if (mode === "daily") return startOfDay(date);
  if (mode === "weekly") return startOfWeek(date);
  if (mode === "monthly") return firstDayOfMonth(date);
  return new Date(date.getFullYear(), 0, 1);
}

function bucketKey(date: Date, mode: BucketMode) {
  const start = bucketStart(date, mode);
  if (mode === "daily" || mode === "weekly") return toDateInput(start);
  if (mode === "monthly") return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return String(start.getFullYear());
}

function bucketLabel(date: Date, mode: BucketMode) {
  if (mode === "daily" || mode === "weekly") return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
  if (mode === "monthly") return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(date);
  return String(date.getFullYear());
}

function incrementBucket(date: Date, mode: BucketMode) {
  if (mode === "daily") return addDays(date, 1);
  if (mode === "weekly") return addDays(date, 7);
  if (mode === "monthly") return addMonths(date, 1);
  return new Date(date.getFullYear() + 1, 0, 1);
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  const day = result.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - daysFromMonday);
  return result;
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCompactMoney(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 0 : 1);
}

function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function isPastDate(value: string | null) {
  if (!value) return false;
  const date = parseDateInput(value);
  return endOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
