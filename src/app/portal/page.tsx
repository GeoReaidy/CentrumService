'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveUserRole, roleHome } from "@/lib/supabase-role";

export default function PortalPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) {
      router.replace("/portal/login");
      return;
    }

    const client = supabase;
    let cancelled = false;

    async function openPortal() {
      const { data, error } = await client.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        router.replace("/portal/login");
        return;
      }

      const role = await resolveUserRole(client, data.user);
      if (cancelled) return;
      router.replace(roleHome(role));
    }

    void openPortal();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <section className="animate-fade-in">
      <div className="badge badge-pulse page-badge">Centrum Portal</div>
      <h1>Opening your portal...</h1>
      <p className="page-intro">Checking your role and loading the correct Centrum workspace.</p>
    </section>
  );
}
