"use client";

import { useState } from "react";

export interface KlariDealProps {
  id: number;
  productName: string;
  productUrl: string | null;
  priceHuf: number | null;
  marketNote: string | null;
  caption: string | null;
  posterSvg: string | null;
  lucaVerdict: string | null;
  status: string;
  createdAt: string;
}

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";

export default function KlariDeal(p: KlariDealProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!p.caption) return;
    try {
      await navigator.clipboard.writeText(p.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const statusBadge =
    p.status === "approved"
      ? "bg-green-500/20 text-green-300"
      : p.status === "posted"
      ? "bg-blue-500/20 text-blue-300"
      : p.status === "rejected"
      ? "bg-white/10 text-white/50"
      : "bg-amber-500/20 text-amber-200";

  return (
    <div className="card card-hover flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="mono h-7 w-7 text-xs" style={{ background: "linear-gradient(135deg,#e84393,#a02060)" }}>
            K
          </div>
          <span className="text-sm font-semibold">Klári napi ajánlata</span>
        </div>
        <span className={`badge ${statusBadge}`}>
          {p.status === "approved" ? "Luca jóváhagyta" : p.status === "posted" ? "kiposztolva" : p.status === "rejected" ? "elvetve" : p.status}
        </span>
      </div>

      {p.posterSvg && p.status !== "rejected" && (
        <div className="overflow-hidden rounded-xl [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: p.posterSvg }} />
      )}

      <div>
        <div className="font-semibold leading-snug">{p.productName}</div>
        {p.priceHuf ? <div className="text-emerald-300 font-bold">{ft(p.priceHuf)}</div> : null}
      </div>

      {p.marketNote && <div className="text-sm text-white/70">📊 {p.marketNote}</div>}

      {p.lucaVerdict && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          <span className="text-white/50">Luca: </span>
          <span className="text-white/85">{p.lucaVerdict}</span>
        </div>
      )}

      {p.caption && p.status !== "rejected" && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-white/40">Facebook poszt szövege</div>
          <div className="whitespace-pre-wrap text-sm text-white/90">{p.caption}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={copy} className="btn btn-primary">
              {copied ? "✓ Másolva" : "Szöveg másolása"}
            </button>
            {p.productUrl && (
              <a className="btn btn-ghost" href={p.productUrl} target="_blank" rel="noreferrer">
                Termék megnyitása
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
