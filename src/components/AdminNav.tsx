'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";

export function AdminNav() {
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    async function checkAdmin() {
      if (!supabase) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;

      const admin = await resolveIsAdmin(supabase, user);
      if (mounted) setIsAdmin(admin);
    }

    checkAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      const admin = await resolveIsAdmin(supabase, session?.user ?? null);
      if (mounted) setIsAdmin(admin);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (!isAdmin) {
    return null;
  }

  return (
    <Link
      href="/admin"
      className="btn btn-secondary"
      style={{
        padding: "0.4rem 0.8rem",
        fontSize: "0.85rem",
        borderColor: "var(--accent)",
        color: "var(--accent)",
        marginLeft: "0.5rem"
      }}
    >
      Admin Panel
    </Link>
  );
}
