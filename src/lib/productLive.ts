import type { UnasProduct } from "./unas";

/**
 * ÉLO-e a termék a boltban? A Unas API a nem publikált / kifutott termékeket is visszaadja, de azok
 * oldala 404 — ilyet SOHA nem hirdetünk (a hirdetett terméknek megvásárolhatónak kell lennie).
 */
export async function isLive(url?: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
    return r.ok; // 200–299
  } catch {
    return false;
  }
}

/**
 * A jelöltek közül visszaadja az ÉLO (elérheto oldalú) termékeket — párhuzamos, batchelt ellenorzéssel.
 * `want`: ennyi élo termék elég (korábban megáll). `cap`: legfeljebb ennyi URL-t ellenoriz (idokorlát-védelem).
 */
export async function pickLiveProducts(candidates: UnasProduct[], want: number, cap = 24): Promise<UnasProduct[]> {
  const list = candidates.slice(0, cap);
  const live: UnasProduct[] = [];
  for (let i = 0; i < list.length && live.length < want; i += 8) {
    const batch = list.slice(i, i + 8);
    const flags = await Promise.all(batch.map((p) => isLive(p.url)));
    batch.forEach((p, idx) => {
      if (flags[idx]) live.push(p);
    });
  }
  return live;
}
