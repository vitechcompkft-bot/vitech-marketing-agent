import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Klári-posztok karbantartása (Bearer <CRON_SECRET>).
 *   GET  ?action=list                      → összes poszt (id, status, created, van-e poster)
 *   POST ?action=purge&what=rejected|all   → törlés (rejected = az elvetettek; all = mind)
 *   POST ?action=delete&id=123             → egy poszt törlése
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const action = req.nextUrl.searchParams.get("action") || "list";

  if (action === "list") {
    const { data } = await sb
      .from("klari_posts")
      .select("id, status, created_at, product_name, poster_url")
      .order("id", { ascending: false });
    const rows = (data || []).map((r: any) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      hasPoster: !!r.poster_url,
      name: (r.product_name || "").slice(0, 40),
    }));
    return NextResponse.json({ ok: true, count: rows.length, rows });
  }

  if (action === "delete") {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ ok: false, error: "Hiányzó id." }, { status: 400 });
    const { error } = await sb.from("klari_posts").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: id });
  }

  if (action === "purge") {
    const what = req.nextUrl.searchParams.get("what") || "rejected";
    let q = sb.from("klari_posts").delete({ count: "exact" });
    if (what === "rejected") q = q.eq("status", "rejected");
    else if (what === "all") q = q.neq("id", 0);
    else return NextResponse.json({ ok: false, error: "what=rejected|all" }, { status: 400 });
    const { error, count } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, purged: count ?? "ok", what });
  }

  return NextResponse.json({ ok: false, error: "ismeretlen action" }, { status: 400 });
}

export const GET = handle;
export const POST = handle;
