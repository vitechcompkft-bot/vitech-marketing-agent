import { NextRequest, NextResponse } from "next/server";
import { startBankAuth, bankEnabled } from "@/lib/bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Banki összekötés indítása (K&H, Enable Banking). A felhasználó nyitja meg a böngészoben:
 *   /api/bank/connect?key=<CRON_SECRET>&iban=HU...
 * → átirányít a K&H SCA-belépésre. Sikeres belépés után a /api/bank/callback fut.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get("key");
  if (secret && key !== secret) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan (hiányzó ?key=CRON_SECRET)" }, { status: 401 });
  }
  if (!bankEnabled()) {
    return NextResponse.json({ ok: false, error: "Hiányzik az ENABLEBANKING_APP_ID / ENABLEBANKING_PRIVATE_KEY env." }, { status: 400 });
  }
  const iban = req.nextUrl.searchParams.get("iban");
  if (!iban) {
    return new NextResponse(
      `<form style="font-family:sans-serif;max-width:420px;margin:40px auto" method="get">
        <h3>K&H bank összekötése</h3>
        <p>Add meg a K&H IBAN számodat (a banki belépéshez kell):</p>
        <input type="hidden" name="key" value="${key ?? ""}"/>
        <input name="iban" placeholder="HU.. ." style="width:100%;padding:8px;font-size:16px" required/>
        <button style="margin-top:12px;padding:10px 16px;font-size:16px">Tovább a K&H belépéshez →</button>
      </form>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  try {
    const { url } = await startBankAuth(iban);
    return NextResponse.redirect(url);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
