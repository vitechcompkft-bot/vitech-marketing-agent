import { NextRequest, NextResponse } from "next/server";
import { setOrderHidden, setOrderPaid } from "@/lib/webshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Webshop rendelés-muveletek a dashboardról: törlés (elrejtés) / visszaállítás, fizetettre állítás / visszavonás.
 * NEM middleware-exempt → a dashboard Basic Auth védi (a böngészobol automatikusan megy a hitelesítés).
 * Body: { action: "delete" | "restore" | "markPaid" | "unmarkPaid", key: "<rendelésszám>" }
 */
async function handle(req: NextRequest) {
  // Auth: a helyi/teszt Bearer titok VAGY a dashboardból jövo, Basic Auth-tal hitelesített böngészo-hívás.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret && auth !== `Bearer ${secret}` && !auth.startsWith("Basic ")) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* üres body */
  }
  const key = String(body?.key || "").trim();
  const action = String(body?.action || "").trim();
  if (!key) return NextResponse.json({ ok: false, error: "Hiányzó rendelésszám." }, { status: 400 });
  try {
    if (action === "delete") await setOrderHidden(key, true);
    else if (action === "restore") await setOrderHidden(key, false);
    else if (action === "markPaid") await setOrderPaid(key, true);
    else if (action === "unmarkPaid") await setOrderPaid(key, false);
    else return NextResponse.json({ ok: false, error: "Ismeretlen muvelet." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const POST = handle;
