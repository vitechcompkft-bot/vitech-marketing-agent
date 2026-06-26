/**
 * Higgsfield kép-generátor kliens — Klári plakát-jelenetéhez (alternatíva a fal.ai Bria mellé).
 * REST: POST https://platform.higgsfield.ai/{model}  ·  Auth: "Key KEY_ID:KEY_SECRET".
 * Env: HIGGSFIELD_KEY_ID, HIGGSFIELD_KEY_SECRET (+ opcionális felülbírálók a modell/mezo finomhangolásához).
 *
 * A Higgsfield image-to-image (valódi termék a jelenetben) dokumentációja hiányos a pontos mezonévrol,
 * ezért a modell, a referencia-kép mezoje, a státusz-útvonal és a body-csomagolás ENV-bol felülbírálható,
 * így élesben (kulccsal) a diagnosztikai végponttal pontosítható újra-deploy nélkül is.
 */
const HF_BASE = process.env.HIGGSFIELD_BASE || "https://platform.higgsfield.ai";
const HF_MODEL = process.env.HIGGSFIELD_MODEL || "flux-pro/kontext/max"; // image-conditioned (Kontext)
const HF_IMAGE_FIELD = process.env.HIGGSFIELD_IMAGE_FIELD || "input_image"; // referencia-kép mezo
const HF_STATUS_PATH = process.env.HIGGSFIELD_STATUS_PATH || "generations"; // GET {base}/{path}/{id}
const HF_WRAP_INPUT = process.env.HIGGSFIELD_WRAP_INPUT === "1"; // ha a body-t {input:{...}} alá kell csomagolni

export function higgsfieldEnabled(): boolean {
  return !!(process.env.HIGGSFIELD_KEY_ID && process.env.HIGGSFIELD_KEY_SECRET);
}

function hfHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_KEY_SECRET}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Eredmény-URL kinyerése többféle lehetséges válasz-alakból. */
function extractUrl(j: any): string | null {
  return (
    j?.results?.raw?.url ||
    j?.results?.[0]?.url ||
    j?.images?.[0]?.url ||
    j?.jobs?.[0]?.results?.raw?.url ||
    j?.jobs?.[0]?.results?.[0]?.url ||
    j?.output?.[0] ||
    j?.url ||
    null
  );
}
function extractId(j: any): string | null {
  return j?.id || j?.request_id || j?.job_id || j?.jobs?.[0]?.id || j?.job_set_id || null;
}
function extractStatus(j: any): string {
  return String(j?.status || j?.jobs?.[0]?.status || "").toLowerCase();
}

function buildBody(prompt: string, imageUrl: string | undefined, aspectRatio: string): any {
  const inner: any = { prompt, aspect_ratio: aspectRatio, resolution: "1k" };
  if (imageUrl && HF_IMAGE_FIELD) inner[HF_IMAGE_FIELD] = imageUrl;
  return HF_WRAP_INPUT ? { input: inner } : inner;
}

/**
 * Termék-jelenet generálása a VALÓDI termékképbol (mint a fal.ai Bria) — a plakát háttere lesz,
 * a sablon teszi rá a logót + szöveget. Hiba esetén null → a hívó visszaesik a fal.ai-ra.
 */
export async function generateProductSceneHF(
  productImageUrl: string,
  prompt: string,
  aspectRatio = "3:2"
): Promise<string | null> {
  if (!higgsfieldEnabled() || !productImageUrl) return null;
  try {
    const res = await fetch(`${HF_BASE}/${HF_MODEL}`, {
      method: "POST",
      headers: hfHeaders(),
      body: JSON.stringify(buildBody(prompt, productImageUrl, aspectRatio)),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => ({}));
    let url = extractUrl(j);
    if (url) return url; // azonnali eredmény (withPolling-szeru válasz)

    const id = extractId(j);
    if (!id) return null;
    const statusUrl = `${HF_BASE}/${HF_STATUS_PATH}/${id}`;
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const s = await fetch(statusUrl, { headers: hfHeaders(), signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!s) continue;
      const sj = await s.json().catch(() => ({}));
      url = extractUrl(sj);
      if (url) return url;
      const st = extractStatus(sj);
      if (st === "failed" || st === "nsfw" || st === "error" || st === "canceled") return null;
    }
    return null;
  } catch {
    return null;
  }
}

/** DIAGNOSZTIKA: nyers POST + (ha van id) egy státusz-lekérés visszaadása — az API pontos alakjának feltérképezéséhez. */
export async function higgsfieldRawTest(opts: {
  prompt: string;
  imageUrl?: string;
  model?: string;
  imageField?: string;
  statusPath?: string;
  wrapInput?: boolean;
  aspectRatio?: string;
}): Promise<any> {
  if (!higgsfieldEnabled()) return { ok: false, error: "Nincs HIGGSFIELD_KEY_ID/SECRET env." };
  const model = opts.model || HF_MODEL;
  const aspect = opts.aspectRatio || "3:2";
  const inner: any = { prompt: opts.prompt, aspect_ratio: aspect, resolution: "1k" };
  const field = opts.imageField ?? HF_IMAGE_FIELD;
  if (opts.imageUrl && field) inner[field] = opts.imageUrl;
  const body = (opts.wrapInput ?? HF_WRAP_INPUT) ? { input: inner } : inner;
  const out: any = { model, field, body };
  try {
    const res = await fetch(`${HF_BASE}/${model}`, { method: "POST", headers: hfHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    out.postStatus = res.status;
    const text = await res.text();
    out.postRaw = text.slice(0, 1500);
    let j: any = {};
    try { j = JSON.parse(text); } catch {}
    out.extractedId = extractId(j);
    out.extractedUrl = extractUrl(j);
    if (!out.extractedUrl && out.extractedId) {
      const sp = opts.statusPath || HF_STATUS_PATH;
      const sres = await fetch(`${HF_BASE}/${sp}/${out.extractedId}`, { headers: hfHeaders(), signal: AbortSignal.timeout(15000) });
      out.statusUrl = `${HF_BASE}/${sp}/${out.extractedId}`;
      out.statusHttp = sres.status;
      out.statusRaw = (await sres.text()).slice(0, 1500);
    }
    return out;
  } catch (e: any) {
    out.error = e?.message || "hiba";
    return out;
  }
}
