import Link from "next/link";
import { loadDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

const labelOf = (k: string) =>
  (({ erika: "Erika", luca: "Luca", klari: "Klári", judit: "Judit", gyula: "Gyula", mihaly: "Mihály" } as Record<string, string>)[k] || k);

export default async function CsapatPage() {
  const d = await loadDashboard();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">👥 Csapat — feladatok és kommunikáció</h1>
        <Link className="btn btn-ghost" href="/">← Áttekintés</Link>
      </div>

      {/* Feladatok a tulajdonostól */}
      <section>
        <h2 className="section-title">📋 Feladatok (tulajdonostól)</h2>
        {d.tasks?.length ? (
          <div className="flex flex-col gap-2">
            {d.tasks.slice(0, 20).map((t) => (
              <div key={t.id} className="card">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white/50">Megbízott:</span>
                    <span className="font-semibold">{t.who?.name || labelOf(t.to)}</span>
                    <span className="text-xs text-white/40">· {t.who?.department}</span>
                  </div>
                  <span className={`badge ${t.status === "kész" ? "bg-green-500/20 text-green-300" : t.status === "folyamatban" ? "bg-amber-500/20 text-amber-200" : "bg-sky-500/20 text-sky-200"}`}>
                    {t.status === "kész" ? "✅ kész" : t.status === "folyamatban" ? "⚙️ folyamatban" : "📥 fogadva"}
                  </span>
                </div>
                <div className="text-sm text-white/85">{t.title}</div>
                {t.response && (
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="mb-1 text-xs text-white/45">{t.who?.name} válasza:</div>
                    <div className="whitespace-pre-wrap text-sm text-white/90">{t.response}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <a className="btn btn-ghost" href={`/api/export/file?id=${t.id}&format=pdf`}>📄 PDF</a>
                      <a className="btn btn-ghost" href={`/api/export/file?id=${t.id}&format=docx`}>📝 DOCX</a>
                      <a className="btn btn-ghost" href={`/api/export/file?id=${t.id}&format=xlsx`}>📊 XLSX</a>
                      <a className="btn btn-ghost" href={`/api/export/email?id=${t.id}&format=pdf`} target="_blank" rel="noreferrer">✉️ Emailben kérem</a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-sm text-white/55">Jelenleg nincs kiadott feladat. Írj Erikának a Titkárság oldalon.</div>
        )}
        <div className="mt-2 text-xs text-white/45">Erika a feladatot a megfelelő munkatárshoz továbbítja; itt látod, hogyan halad (fogadva → folyamatban → kész) és a választ.</div>
      </section>

      {/* Csapat-kommunikáció */}
      <section>
        <h2 className="section-title">💬 Csapat-kommunikáció</h2>
        {d.agentMessages?.length ? (
          <div className="flex flex-col gap-2">
            {d.agentMessages.slice(0, 30).map((m) => (
              <div key={m.id} className="card">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-semibold">{labelOf(m.from)}</span>
                  <span className="text-white/40">→</span>
                  <span className="font-semibold">{labelOf(m.to)}</span>
                  <span className={`badge ${m.type === "válasz" ? "bg-green-500/20 text-green-300" : m.type === "riasztás" ? "bg-amber-500/20 text-amber-200" : "bg-sky-500/20 text-sky-200"}`}>{m.type}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-white/85">{m.body}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-sm text-white/55">Nincs friss csapat-üzenet.</div>
        )}
        <div className="mt-2 text-xs text-white/45">Az ügynökök egymással is egyeztetnek: kérdés / kérés / riasztás → a megszólított a saját szakterületi adataival válaszol.</div>
      </section>
    </main>
  );
}
