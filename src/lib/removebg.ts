/**
 * Termékfotó háttér-eltávolítása a remove.bg API-val → átlátszó PNG (data URI).
 * Kulcs hiányában / hibánál null (a hívó visszaesik a sima fotóra).
 */
export async function removeBg(imageUrl: string): Promise<string | null> {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key || !imageUrl) return null;
  try {
    const form = new URLSearchParams();
    form.set("image_url", imageUrl);
    form.set("size", "auto");
    form.set("type", "product");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
