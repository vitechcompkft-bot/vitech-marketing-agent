import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feladatok a dashboard "Feladatok" ablakához — a routolt e-mailekbol.
 * route=gyula → Informatika; route=erika → Egyéb. handled = kész.
 * (Basic Auth védi a middleware-en keresztül, a böngészo küldi a hitelesítést.)
 */
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("emails")
      .select("id, route, subject, summary, gyula_note, from_addr, date, handled, is_shop, urgency, mailbox")
      .in("route", ["gyula", "erika"])
      .eq("handled", false) // a kipipáltak (kész) archiválódnak → nem jelennek meg
      .order("date", { ascending: false })
      .limit(60);
    return NextResponse.json({ tasks: data || [] });
  } catch {
    return NextResponse.json({ tasks: [] });
  }
}
