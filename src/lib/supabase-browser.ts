import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
const REMEMBER_KEY = "centrum_remember_session";

function authStorage() {
  return {
    getItem(key: string) {
      if (typeof window === "undefined") return null;
      const remember = window.localStorage.getItem(REMEMBER_KEY) === "true";
      return (remember ? window.localStorage : window.sessionStorage).getItem(key);
    },
    setItem(key: string, value: string) {
      if (typeof window === "undefined") return;
      const remember = window.localStorage.getItem(REMEMBER_KEY) === "true";
      const primary = remember ? window.localStorage : window.sessionStorage;
      const secondary = remember ? window.sessionStorage : window.localStorage;
      primary.setItem(key, value);
      secondary.removeItem(key);
    },
    removeItem(key: string) {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    },
  };
}

export function setRememberSession(remember: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
}

export function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: authStorage(),
      },
    });
  }

  return browserClient;
}
