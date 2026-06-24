import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** DEBUG: nyers fal.run Bria product-shot válasz (Bearer CRON_SECRET). ?url=<termékfotó> */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "nincs FAL_KEY" });
  const productUrl =
    req.nextUrl.searchParams.get("url") || "https://vitechcompkft.hu/shop_ordered/64089/shop_pic/BI00374.jpg";
  try {
    const res = await fetch("https://fal.run/fal-ai/bria/product-shot", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: productUrl,
        scene_description:
          "a modern bright corporate office, the laptop on a glossy desk on the right, window with city skyline, soft daylight, contact shadow, premium",
        placement_type: "manual_placement",
        manual_placement_selection: "right_center",
        shot_size: [1200, 800],
        fast: true,
        optimize_description: true,
        num_results: 1,
      }),
    });
    const status = res.status;
    const text = await res.text();
    return NextResponse.json({ ok: true, status, body: text.slice(0, 1500) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" });
  }
}
