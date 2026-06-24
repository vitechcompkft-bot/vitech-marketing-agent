"use client";
import { useEffect, useState } from "react";

const KINDS: { value: string; label: string }[] = [
  { value: "google_landscape", label: "Google banner (fekvő 1200×628)" },
  { value: "google_square", label: "Google banner (négyzet 1200×1200)" },
  { value: "fb_landscape", label: "Facebook link-poszt (1200×630)" },
  { value: "fb_square", label: "Facebook feed-poszt (1080×1080)" },
  { value: "story_poster", label: "Story / Plakát (1080×1920)" },
];

type Creative = {
  id?: number;
  kind: string;
  topic: string;
  headline: string;
  subhead: string;
  svg: string;
  created_at?: string;
};

export default function CreativesPage() {
  const [kind, setKind] = useState("google_square");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<Creative | null>(null);
  const [list, setList] = useState<Creative[]>([]);
  const [klari, setKlari] = useState<any[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/creatives").then((x) => x.json()).catch(() => ({ creatives: [] }));
    setList(r.creatives || []);
    const k = await fetch("/api/klari-posts").then((x) => x.json()).catch(() => ({ posts: [] }));
    setKlari(k.posts || []);
  }
  useEffect(() => { refresh(); }, []);

  const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";
  async function copyCaption(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {}
  }
  async function deletePost(id: number) {
    if (!confirm("Biztosan törlöd ezt az ajánlatot?")) return;
    const r = await fetch(`/api/klari-posts?id=${id}`, { method: "DELETE" })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "hálózati hiba" }));
    if (r.ok) {
      setKlari((arr) => arr.filter((x) => x.id !== id)); // csak sikeres törléskor
    } else {
      alert("A törlés nem sikerült: " + (r.error || "ismeretlen hiba"));
    }
  }

  async function generate() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/creatives/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, topic }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurrent(data.creative);
        refresh();
      } else setErr(data.error || "Hiba a generáláskor.");
    } catch (e: any) {
      setErr(e?.message || "Hiba.");
    } finally {
      setLoading(false);
    }
  }

  function downloadPng(svg: string, name: string) {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1200;
      canvas.height = img.naturalHeight || 1200;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = name + ".png";
        a.click();
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  function downloadSvg(svg: string, name: string) {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + ".svg";
    a.click();
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-lg font-bold">Kreatívok — hirdetés, plakát, Facebook-poszt</h1>

      {/* Klári napi ajánlatai */}
      <section>
        <h2 className="section-title">🖼️ Klári napi ajánlatai</h2>
        {klari.length === 0 ? (
          <div className="card text-sm text-white/55">Még nincs ajánlat. Klári minden reggel 7-kor készít egyet.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {klari.map((k) => (
              <div key={k.id} className="card flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="mono h-7 w-7 text-xs" style={{ background: "linear-gradient(135deg,#1a73e8,#0a2a5e)" }}>K</div>
                    <span className="text-sm font-semibold">{k.product_name?.slice(0, 40)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${k.status === "approved" ? "bg-green-500/20 text-green-300" : k.status === "posted" ? "bg-blue-500/20 text-blue-300" : k.status === "pending_image" ? "bg-amber-500/20 text-amber-200" : "bg-white/10 text-white/50"}`}>
                      {k.status === "approved" ? "Luca jóváhagyta" : k.status === "posted" ? "kiposztolva" : k.status === "rejected" ? "elvetve" : k.status === "pending_image" ? "⏳ plakát készül…" : k.status}
                    </span>
                    <button onClick={() => deletePost(k.id)} title="Törlés" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/60 hover:bg-red-500/20 hover:text-red-200">🗑</button>
                  </div>
                </div>

                {k.status !== "rejected" && (k.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={k.poster_url} alt={k.headline || "plakát"} className="w-full rounded-xl" />
                ) : k.poster_svg ? (
                  <div className="overflow-hidden rounded-xl bg-black/10 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: k.poster_svg }} />
                ) : null)}

                {k.price_huf ? <div className="font-bold text-emerald-300">{ft(k.price_huf)}</div> : null}
                {k.market_note && <div className="text-sm text-white/70">📊 {k.market_note}</div>}
                {k.luca_verdict && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                    <span className="text-white/50">Luca: </span>
                    <span className="text-white/85">{k.luca_verdict}</span>
                  </div>
                )}

                {k.caption && k.status !== "rejected" && (
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 text-xs uppercase tracking-wide text-white/40">Facebook poszt szövege</div>
                    <div className="whitespace-pre-wrap text-sm text-white/90">{k.caption}</div>
                  </div>
                )}

                {(k.poster_url || k.poster_svg) && k.status !== "rejected" && (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-primary" onClick={() => copyCaption(k.id, k.caption || "")}>{copied === k.id ? "✓ Másolva" : "Szöveg másolása"}</button>
                    {k.poster_url ? (
                      <a className="btn btn-ghost" href={k.poster_url} target="_blank" rel="noreferrer">⬇ Plakát (PNG)</a>
                    ) : (
                      <>
                        <button className="btn btn-ghost" onClick={() => downloadPng(k.poster_svg, `vitech_klari_${k.id}`)}>⬇ Plakát PNG</button>
                        <button className="btn btn-ghost" onClick={() => downloadSvg(k.poster_svg, `vitech_klari_${k.id}`)}>SVG</button>
                      </>
                    )}
                    {k.product_url && <a className="btn btn-ghost" href={k.product_url} target="_blank" rel="noreferrer">Termék</a>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="card flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="text-sm text-white/70">Formátum</label>
            <select className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-white/70">Miről szóljon? (brief)</label>
            <input className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="pl. nyári akció felújított ThinkPadekre, ingyenes kiszállítással" onKeyDown={(e) => e.key === "Enter" && generate()} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={generate} disabled={loading}>{loading ? "Generálás…" : "✨ Kreatív generálása"}</button>
          {err && <span className="text-sm text-red-300">{err}</span>}
        </div>
      </div>

      {current && (
        <div className="card flex flex-col gap-3">
          <div className="text-sm text-white/60">Eredmény — <b className="text-white/90">{current.headline}</b></div>
          <div className="flex justify-center rounded-lg bg-black/20 p-3">
            <div className="max-w-full" style={{ width: 420 }} dangerouslySetInnerHTML={{ __html: current.svg }} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => downloadPng(current.svg, `vitech_${current.kind}`)}>⬇ PNG letöltés</button>
            <button className="btn btn-ghost" onClick={() => downloadSvg(current.svg, `vitech_${current.kind}`)}>SVG letöltés</button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Korábbi kreatívok</h2>
        {list.length === 0 ? (
          <div className="card text-white/60">Még nincs generált kreatív. (Vagy a Supabase nincs beállítva.)</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <div key={c.id} className="card flex flex-col gap-2">
                <div className="flex justify-center rounded-lg bg-black/20 p-2">
                  <div style={{ width: 240 }} dangerouslySetInnerHTML={{ __html: c.svg }} />
                </div>
                <div className="text-xs text-white/60">{c.topic}</div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost text-xs" onClick={() => downloadPng(c.svg, `vitech_${c.kind}`)}>PNG</button>
                  <button className="btn btn-ghost text-xs" onClick={() => downloadSvg(c.svg, `vitech_${c.kind}`)}>SVG</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
