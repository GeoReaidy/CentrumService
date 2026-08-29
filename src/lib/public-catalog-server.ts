type PublicFetchResult<T> = {
  data: T[];
  failed: boolean;
};

export type PublicPlan = {
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

export type PublicCoverageRegion = {
  id: number;
  name: string;
  name_fr: string | null;
  name_ar: string | null;
  description: string | null;
  description_fr: string | null;
  description_ar: string | null;
  sort_order: number;
};

const REVALIDATE_SECONDS = 300;

async function fetchPublicRows<T>(
  table: string,
  query: URLSearchParams,
): Promise<PublicFetchResult<T>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(`Public ${table} preload skipped because Supabase public environment variables are missing.`);
    return { data: [], failed: true };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?${query.toString()}`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        next: { revalidate: REVALIDATE_SECONDS },
      },
    );

    if (!response.ok) {
      console.error(`Public ${table} preload failed with HTTP ${response.status}.`);
      return { data: [], failed: true };
    }

    return {
      data: (await response.json()) as T[],
      failed: false,
    };
  } catch (error) {
    console.error(`Public ${table} preload failed.`, error);
    return { data: [], failed: true };
  }
}

export function getPublicPlans() {
  const query = new URLSearchParams({
    select:
      "id,name,name_fr,name_ar,description,description_fr,description_ar,speed_down_mbps,speed_up_mbps,monthly_quota_gb,monthly_price_usd,is_active",
    is_active: "eq.true",
    order: "monthly_price_usd.asc",
  });

  return fetchPublicRows<PublicPlan>("plans", query);
}

export function getPublicCoverageRegions() {
  const query = new URLSearchParams({
    select: "id,name,name_fr,name_ar,description,description_fr,description_ar,sort_order",
    is_active: "eq.true",
    order: "sort_order.asc,name.asc",
  });

  return fetchPublicRows<PublicCoverageRegion>("coverage_regions", query);
}
