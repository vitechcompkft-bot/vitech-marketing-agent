import type { ReactNode } from "react";
import { loadDashboard } from "@/lib/dashboard";
import RunNowButton from "@/components/RunNowButton";
import { getTodaySchedule, SUMMARY_TIME } from "@/lib/erika";

export const dynamic = "force-dynamic";

const AGENT_NAME: Record<string, string> = { klari: "Klári", judit: "Judit", mihaly: "Mihály", luca: "Luca", gyula: "Gyula" };

export default async function Overview() {
  const { config, agents, statuses, supabaseReady, mock } = await loadDashboard();
  const schedule = await getTodaySchedule();
  const erika = agents.find((a) => a.key === "erika");
  const gyula = agents.find((a) => a.key === "gyula");
  const mihaly = agents.find((a) => a.key === "mihaly");
  const st = (k: string) => statuses.find((s) => s.key === k);

  return (
    <main className="flex flex-col gap-6">
      {/* Setup figyelmeztetések */}
      {mock && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          🧪 <b>Mock mód</b> — a számok teszt-adatok. Éles Google Ads adatokhoz: állítsd <code>USE_MOCK_DATA=false</code> és töltsd ki a Google Ads kulcsokat.
        </div>
      )}
      {!supabaseReady && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          ⚠️ <b>Supabase nincs beállítva</b> — a mentés/napló/beavatkozás nem működik, amíg nincs adatbázis. Kövesd a README-t (séma + .env.local).
        </div>
      )}

      {/* Agent státusz */}
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-white/60">Agent állapota</div>
          <div className="text-lg font-bold">
            {config ? (config.agent_enabled ? "🟢 Bekapcsolva" : "⛔ Kikapcsolva") : "—"}
            {config && <span className="ml-2 text-sm font-normal text-white/60">({config.autonomy_level})</span>}
          </div>
        </div>
        <RunNowButton />
      </div>

      {/* Szervezet */}
      <Panel accent="#1a73e8">
        <h2 className="section-title">🏢 A Vitech AI-csapat</h2>

        {/* Titkárság — Erika (a kapcsolattartó) */}
        <a href="/iroda" className="card card-hover mb-3 flex items-center gap-3 bg-brand/10">
          <Person avatar={erika?.avatar} name="Erika" fallback="Erika" />
          <div className="flex-1">
            <div className="font-semibold">{erika?.name ?? "Erika"} <span className="badge ml-1 bg-brand/20 text-brand">Titkárság</span></div>
            <StatusLine s={st("erika")} fallback="Üzenetek rendezése + napi összegzés" />
            <div className="mt-0.5 text-xs text-brand">Hozzád minden rajta keresztül → Írj neki ➜</div>
          </div>
        </a>

        {/* Osztályok */}
        <div className="grid gap-3 md:grid-cols-3">
          <Dept title="Marketing" accent="#1a73e8" href="/osztaly/marketing">
            <Member avatar={config?.agent_avatar || "/avatars/luca-1.svg"} name={config?.agent_name ?? "Luca"} role="osztályvezető · hirdetés + SEO" lead status={st("luca")} />
            <Member avatar={config?.klari_avatar} name="Klári" role="napi ajánlat + plakát" status={st("klari")} />
            <Member avatar={undefined} name="Judit" role="LinkedIn tartalom + blog" status={st("judit")} />
          </Dept>
          <Dept title="Informatika" accent="#22d3ee" href="/osztaly/informatika">
            <Member avatar={gyula?.avatar} name={gyula?.name ?? "Gyula"} role={gyula?.role ?? "IT vezető · automatizálás"} lead status={st("gyula")} />
          </Dept>
          <Dept title="Gazdasági" accent="#22c55e" href="/osztaly/gazdasagi">
            <Member avatar={mihaly?.avatar} name={mihaly?.name ?? "Mihály"} role={mihaly?.role ?? "Gazdasági vezető · bevétel + kiadás"} lead status={st("mihaly")} />
          </Dept>
        </div>

        <div className="mt-2 text-xs text-white/40">Kattints egy osztályra a részletekért (hirdetés, felügyelet, pénzügy).</div>
      </Panel>

      {/* Mai menetrend — Erika felügyeli: a feladat idopontja után pár perccel ellenoriz + nógat */}
      <Panel accent="#a855f7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">🗓️ Mai menetrend — {schedule.date}</h2>
          <span className="text-xs text-white/50">Erika felügyeli · esti összegzés {SUMMARY_TIME}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="py-1.5 pr-3">Időpont</th>
                <th className="pr-3">Munkatárs</th>
                <th className="pr-3">Feladat</th>
                <th>Ellenőrzési állapot</th>
              </tr>
            </thead>
            <tbody>
              {schedule.tasks.map((t) => (
                <tr key={t.key} className="border-t border-white/5 align-top">
                  <td className="py-2 pr-3 font-mono text-white/80">{t.time}</td>
                  <td className="pr-3 font-semibold">{AGENT_NAME[t.key] || t.key}</td>
                  <td className="pr-3 text-white/70">{t.label}</td>
                  <td><SchedStatus t={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-white/40">
          A feladat időpontja után pár perccel Erika ellenőrzi; ha nincs kész, rászól a felelősre és újraindítja — nem hagyja elkészületlenül.
        </div>
      </Panel>

    </main>
  );
}

function SchedStatus({ t }: { t: { status: string; doneAt?: string | null; nudges?: number } }) {
  if (t.status === "done")
    return <span className="badge bg-green-500/20 text-green-300">✅ kész{t.doneAt ? ` · ${t.doneAt}` : ""}</span>;
  if (t.status === "late")
    return <span className="badge bg-red-500/20 text-red-300">🔴 késik{t.nudges ? ` · nógatva ${t.nudges}×` : ""}</span>;
  if (t.status === "working") return <span className="badge bg-amber-500/20 text-amber-300">🟡 folyamatban</span>;
  return <span className="badge bg-white/10 text-white/50">⚪ még nem esedékes</span>;
}

const FALLBACK_AVATAR = (seed: string) => `https://api.dicebear.com/9.x/lorelei/svg?seed=${seed}&backgroundColor=11243f`;

function Person({ avatar, name, fallback }: { avatar?: string | null; name: string; fallback: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={avatar || FALLBACK_AVATAR(fallback)} alt={name} className="h-12 w-12 rounded-full border border-white/20 bg-white/10 object-cover" />;
}
function Dept({ title, accent, href, children }: { title: string; accent: string; href?: string; children: ReactNode }) {
  const style = {
    background: `linear-gradient(180deg, ${accent}26, rgba(255,255,255,0.03))`,
    borderColor: `${accent}66`,
    boxShadow: `0 10px 30px -18px ${accent}88`,
  } as const;
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
          {title}
        </div>
        {href && <span className="text-xs font-semibold" style={{ color: accent }}>részletek →</span>}
      </div>
      {children}
    </>
  );
  const cls = "flex flex-col gap-3 rounded-2xl border p-5" + (href ? " card-hover transition" : "");
  return href ? (
    <a href={href} className={cls} style={style}>
      {inner}
    </a>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}
type Status = { status: string; status_note?: string | null; daily_task?: string | null } | undefined;
const STATUS_META: Record<string, { dot: string; label: string }> = {
  working: { dot: "bg-amber-400", label: "dolgozik" },
  done: { dot: "bg-green-400", label: "kész" },
  waiting: { dot: "bg-blue-400", label: "vár" },
  error: { dot: "bg-red-400", label: "hiba" },
  idle: { dot: "bg-white/40", label: "tétlen" },
};
function StatusLine({ s, fallback }: { s: Status; fallback?: string }) {
  const meta = STATUS_META[s?.status || "idle"] || STATUS_META.idle;
  return (
    <div className="mt-0.5 flex items-start gap-1.5 text-xs text-white/60">
      <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      <span>{s?.status_note || fallback || s?.daily_task || "—"}</span>
    </div>
  );
}
function Member({ avatar, name, role, lead, status }: { avatar?: string | null; name: string; role: string; lead?: boolean; status?: Status }) {
  return (
    <div className="flex items-start gap-3">
      <Person avatar={avatar} name={name} fallback={name} />
      <div className="min-w-0">
        <div className="text-sm font-semibold">
          {name} {lead && <span className="badge ml-1 bg-brand/20 text-brand">vezető</span>}
        </div>
        <div className="text-xs text-white/45">{role}</div>
        {status && <StatusLine s={status} fallback={status.daily_task || undefined} />}
      </div>
    </div>
  );
}

function Panel({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5"
      style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
    >
      {children}
    </section>
  );
}
