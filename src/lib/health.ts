import { supabaseAdmin } from "./supabase";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";
import { MONITORED_SITES } from "./sites";

export interface SiteHealthRow {
  id: string;
  name: string;
  url: string;
  scope: string;
  status: string; // up | down | unknown
  http_code: number | null;
  latency_ms: number | null;
  note: string | null;
  checked_at: string | null;
}

/** Egy publikus oldal pingelése: HTTP-válasz < 500 → up; 5xx vagy hálózati hiba → down. */
async function pingOne(url: string): Promise<{ status: "up" | "down"; httpCode: number | null; latencyMs: number; note: string }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(9000), cache: "no-store" });
    const latencyMs = Date.now() - started;
    const code = res.status;
    // 2xx/3xx/4xx = a szerver válaszol (fut). 5xx = szerver-hiba → down.
    return { status: code >= 500 ? "down" : "up", httpCode: code, latencyMs, note: code >= 500 ? `HTTP ${code}` : "" };
  } catch (e: any) {
    return { status: "down", httpCode: null, latencyMs: Date.now() - started, note: (e?.name === "TimeoutError" ? "Timeout (>9s)" : e?.message || "hálózati hiba").slice(0, 80) };
  }
}

async function upsertAndAlert(
  site: { id: string; name: string; url: string; scope: string },
  next: { status: string; httpCode: number | null; latencyMs: number | null; note: string }
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: prev } = await sb.from("site_health").select("status").eq("id", site.id).maybeSingle();
  const prevStatus = prev?.status || "unknown";

  await sb.from("site_health").upsert({
    id: site.id,
    name: site.name,
    url: site.url,
    scope: site.scope,
    status: next.status,
    http_code: next.httpCode,
    latency_ms: next.latencyMs,
    note: next.note || null,
    checked_at: new Date().toISOString(),
  });

  // Állapotváltáskor Telegram (leesés / helyreállás).
  if (prevStatus !== "unknown" && prevStatus !== next.status) {
    if (next.status === "down") {
      await sendTelegram(`🔴 *Gyula — oldal LEÁLLT*\n${site.name}\n${site.url}\n${next.note || ""}`).catch(() => {});
    } else if (next.status === "up") {
      await sendTelegram(`🟢 *Gyula — oldal helyreállt*\n${site.name}\n${site.url}`).catch(() => {});
    }
  }
  return next.status;
}

/** A PUBLIKUS oldalak pingelése a felhobol (Gyula). A LAN-osokat a belso agent jelenti. */
export async function checkPublicSites(): Promise<{ checked: number; up: number; down: number }> {
  const pub = MONITORED_SITES.filter((s) => s.scope === "public");
  let up = 0;
  let down = 0;
  for (const site of pub) {
    const r = await pingOne(site.url);
    const status = await upsertAndAlert(site, { status: r.status, httpCode: r.httpCode, latencyMs: r.latencyMs, note: r.note });
    if (status === "up") up++;
    else down++;
  }
  await setAgentStatus("gyula", down > 0 ? "waiting" : "working", `Publikus oldalak: ${up}/${pub.length} elérheto${down ? ` · ${down} LE` : ""}`);
  return { checked: pub.length, up, down };
}

/** A belso LAN-agent jelentése: [{id,status,http_code,latency_ms,note}]. */
export async function reportSites(
  results: { id: string; status: string; http_code?: number | null; latency_ms?: number | null; note?: string }[]
): Promise<{ updated: number }> {
  let updated = 0;
  for (const r of results) {
    const site = MONITORED_SITES.find((s) => s.id === r.id);
    if (!site) continue;
    await upsertAndAlert(site, {
      status: r.status === "up" ? "up" : "down",
      httpCode: r.http_code ?? null,
      latencyMs: r.latency_ms ?? null,
      note: r.note || "",
    });
    updated++;
  }
  return { updated };
}

export async function getSiteHealth(): Promise<SiteHealthRow[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("site_health").select("*");
    const rows = (data as SiteHealthRow[]) || [];
    // A teljes lista a sites.ts-bol, kiegészítve a tárolt állapottal (hogy a még nem ellenorzöttek is látszanak).
    return MONITORED_SITES.map((s) => {
      const r = rows.find((x) => x.id === s.id);
      return (
        r || { id: s.id, name: s.name, url: s.url, scope: s.scope, status: "unknown", http_code: null, latency_ms: null, note: null, checked_at: null }
      );
    });
  } catch {
    return MONITORED_SITES.map((s) => ({ id: s.id, name: s.name, url: s.url, scope: s.scope, status: "unknown", http_code: null, latency_ms: null, note: null, checked_at: null }));
  }
}
