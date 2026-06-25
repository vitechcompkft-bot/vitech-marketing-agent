/**
 * Vitech – Belso oldal-figyelo agent (Gyula keze).
 * A HUNOR LAN-on futó gepen fut (pl. 10.49.8.2 vagy .43), mert a felho (Vercel) NEM eri el
 * a 10.49.8.x cimeket. Pingeli a belso oldalakat es jelent a felhobe (/api/health/report).
 *
 * Futtatas:  node health-agent.js          (egyszer lefut)
 *            node health-agent.js --loop    (folyamatosan, INTERVAL_MS szerint)
 * Windows Utemezo (Task Scheduler): allitsd be 5-10 percenkent a "node health-agent.js"-t.
 *
 * Node 18+ kell (beepitett fetch).
 */

// ---- BEALLITAS ----
const BASE = process.env.VITECH_BASE || "https://vitech-marketing-agent.vercel.app";
const KEY = process.env.CRON_SECRET || "vitech-cron-7f3a91c8e2b64d05a1"; // a Vercel CRON_SECRET ertek
const INTERVAL_MS = 5 * 60 * 1000; // --loop eseten 5 perc

// A LAN-os oldalak (az id-knak EGYEZNIE kell a felhoben levo sites.ts id-jaival):
const SITES = [
  { id: "hr-doksi", url: "http://10.49.8.43:3002/admin" },
  { id: "ugyviteli", url: "http://10.49.8.43:3000/" },
  { id: "kereskedelmi", url: "http://10.49.8.2:3000/" },
  { id: "munkaugyi", url: "http://10.49.8.43:3001/" },
  { id: "nyomtato", url: "http://10.49.8.2:3300/nyomtatok/allasok" },
];

async function pingOne(url) {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: ctrl.signal });
    clearTimeout(t);
    const latency_ms = Date.now() - started;
    const code = res.status;
    return { status: code >= 500 ? "down" : "up", http_code: code, latency_ms, note: code >= 500 ? `HTTP ${code}` : "" };
  } catch (e) {
    return { status: "down", http_code: null, latency_ms: Date.now() - started, note: (e && e.name === "AbortError" ? "Timeout (>9s)" : (e && e.message) || "halozati hiba") };
  }
}

async function runOnce() {
  const results = [];
  for (const s of SITES) {
    const r = await pingOne(s.url);
    results.push({ id: s.id, ...r });
    console.log(`${r.status === "up" ? "OK " : "LE "} ${s.id} (${r.http_code || r.note}) ${r.latency_ms}ms`);
  }
  try {
    const res = await fetch(`${BASE}/api/health/report`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ results }),
    });
    console.log("Jelentve a felhobe:", res.status, await res.text());
  } catch (e) {
    console.error("Nem sikerult jelenteni:", e && e.message);
  }
}

(async () => {
  if (process.argv.includes("--loop")) {
    console.log(`Loop mod – ${INTERVAL_MS / 60000} percenkent.`);
    for (;;) {
      await runOnce();
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  } else {
    await runOnce();
  }
})();
