import { createClient } from "@supabase/supabase-js";

/**
 * Szerveroldali Supabase kliens a SERVICE ROLE kulccsal.
 * Csak szerveren (API route / cron) használd — sosem a böngészőben!
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Hiányzó SUPABASE_URL vagy SERVICE_ROLE_KEY a környezeti változókban.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
