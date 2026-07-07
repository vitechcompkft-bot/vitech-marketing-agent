import Link from "next/link";
import { listPremiumPosters } from "@/lib/premium";
import PremiumActions from "@/components/PremiumActions";

export const dynamic = "force-dynamic";

const STATUS_ORDER = ["pending", "approved", "posted", "rejected"] as const;
const STATUS_LABEL: Record<string, string> = { pending: "⏳ Jóváhagyásra vár", approved: "✅ Jóváhagyva", posted: "📘 Kiposztolva", rejected: "🗑️ Elvetve" };

export default async function PlakatokPage() {
  const all = await listPremiumPosters();
  const pending = all.filter((p) => p.status === "pending");
  const others = all.filter((p) => p.status !== "pending");

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">🖼️ Plakátok — jóváhagyás</h1>
        <Link className="btn btn-ghost" href="/">← Áttekintés</Link>
      </div>

      <div className="text-xs text-white/45">
        Itt látod a prémium napi plakátokat. Amit <b>jóváhagysz</b>, az bekerül a napi forgatásba (17:00), és/vagy azonnal
        kiposztolhatod. Amit elvetsz, nem megy ki.
      </div>

      {/* Jóváhagyásra váró */}
      <section>
        <h2 className="section-title">⏳ Jóváhagyásra vár ({pending.length})</h2>
        {pending.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((p) => (
              <div key={p.id} className="card">
                <img src={p.url} alt={p.headline} className="w-full rounded-lg border border-white/10" />
                <div className="mt-2 font-semibold text-white/90">{p.headline}</div>
                {p.sub && <div className="text-sm text-white/60">{p.sub}</div>}
                <PremiumActions id={p.id} status={p.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-sm text-white/55">Jelenleg nincs jóváhagyásra váró plakát.</div>
        )}
      </section>

      {/* Többi (jóváhagyott / kiposztolt / elvetett) */}
      {others.length > 0 && (
        <section>
          <h2 className="section-title">📚 Korábbiak ({others.length})</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {others.map((p) => (
              <div key={p.id} className="card">
                <img src={p.url} alt={p.headline} className="w-full rounded-lg border border-white/10" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium text-white/85" title={p.headline}>{p.headline}</div>
                  <span className="badge whitespace-nowrap bg-white/10 text-white/60">{STATUS_LABEL[p.status] || p.status}</span>
                </div>
                {p.fbUrl && (
                  <a className="mt-1 block text-xs text-sky-300 underline" href={p.fbUrl} target="_blank" rel="noreferrer">
                    Megnézem a Facebookon
                  </a>
                )}
                <PremiumActions id={p.id} status={p.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
