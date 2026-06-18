"use client";
import { useEffect, useState } from "react";

const AVATAR_PRESETS = [
  "/avatars/luca-1.svg",
  "https://api.dicebear.com/9.x/lorelei/svg?seed=Luca&backgroundColor=2e86ff",
  "https://api.dicebear.com/9.x/lorelei/svg?seed=Petra&backgroundColor=7c4dff",
  "https://api.dicebear.com/9.x/lorelei/svg?seed=Nora&backgroundColor=00b894",
  "https://api.dicebear.com/9.x/notionists/svg?seed=Kata&backgroundColor=e8232f",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Reka&backgroundColor=ff9f1c",
];

type Cfg = {
  agent_name: string;
  agent_avatar: string;
  agent_persona: string;
  agent_enabled: boolean;
  autonomy_level: string;
  max_daily_budget_huf: number;
  max_budget_change_pct: number;
  min_data_clicks: number;
  target_roas: number;
  allow_pause_ads: boolean;
  allow_budget_changes: boolean;
  allow_create_campaign: boolean;
  telegram_chat_id: string | null;
};

export default function SettingsPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => setCfg(d)).catch(() => setMsg("Nem sikerült betölteni (Supabase?)."));
  }, []);

  function set<K extends keyof Cfg>(k: K, v: Cfg[K]) {
    if (cfg) setCfg({ ...cfg, [k]: v });
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (res.ok) setMsg("Mentve ✅"); else setMsg("Hiba a mentéskor.");
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <main className="card text-white/60">{msg || "Betöltés…"}</main>;

  return (
    <main className="flex flex-col gap-5">
      <h1 className="text-lg font-bold">Beállítások &amp; korlátok</h1>

      {/* Személyiség */}
      <div className="card flex flex-col gap-4">
        <div className="font-semibold">Személyiség</div>
        <div className="flex items-center gap-4">
          <img src={cfg.agent_avatar} alt="avatar" className="h-16 w-16 rounded-full border border-white/20 bg-white/10 object-cover" />
          <div className="flex-1">
            <label className="text-sm text-white/70">Név</label>
            <input className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" value={cfg.agent_name} onChange={(e) => set("agent_name", e.target.value)} placeholder="pl. Luca" />
          </div>
        </div>

        <div>
          <label className="text-sm text-white/70">Karakter (avatar) — válassz vagy adj meg URL-t</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVATAR_PRESETS.map((url) => (
              <button key={url} type="button" onClick={() => set("agent_avatar", url)}
                className={`h-12 w-12 overflow-hidden rounded-full border-2 ${cfg.agent_avatar === url ? "border-brand" : "border-white/15"}`}>
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <input className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs" value={cfg.agent_avatar} onChange={(e) => set("agent_avatar", e.target.value)} placeholder="vagy saját kép URL-je…" />
        </div>

        <div>
          <label className="text-sm text-white/70">Személyiség leírása (ez alakítja a hangnemét és viselkedését)</label>
          <textarea rows={3} className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" value={cfg.agent_persona} onChange={(e) => set("agent_persona", e.target.value)} />
        </div>
      </div>

      <div className="card flex items-center justify-between">
        <div>
          <div className="font-semibold">Vész-leállító</div>
          <div className="text-sm text-white/60">Kikapcsolva az Agent semmihez nem nyúl, csak mér.</div>
        </div>
        <Toggle on={cfg.agent_enabled} onChange={(v) => set("agent_enabled", v)} />
      </div>

      <div className="card flex flex-col gap-2">
        <label className="text-sm font-semibold">Autonómia szint</label>
        <select className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" value={cfg.autonomy_level} onChange={(e) => set("autonomy_level", e.target.value)}>
          <option value="suggest">Csak javaslat (te hagyod jóvá)</option>
          <option value="auto_small">Auto kicsiben, jóváhagyás nagyban</option>
          <option value="auto_guardrails">Teljesen automatikus, korlátokkal</option>
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <NumField label="Max. napi keret / kampány (Ft)" value={cfg.max_daily_budget_huf} onChange={(v) => set("max_daily_budget_huf", v)} />
        <NumField label="Max. keret-változás egy lépésben (%)" value={cfg.max_budget_change_pct} onChange={(v) => set("max_budget_change_pct", v)} />
        <NumField label="Min. kattintás döntéshez" value={cfg.min_data_clicks} onChange={(v) => set("min_data_clicks", v)} />
        <NumField label="ROAS-cél (0 = még nincs)" value={cfg.target_roas} step={0.1} onChange={(v) => set("target_roas", v)} />
      </div>

      <div className="card flex flex-col gap-3">
        <CheckRow label="Engedélyezett: keret-módosítás" on={cfg.allow_budget_changes} onChange={(v) => set("allow_budget_changes", v)} />
        <CheckRow label="Engedélyezett: kampány szüneteltetése" on={cfg.allow_pause_ads} onChange={(v) => set("allow_pause_ads", v)} />
        <CheckRow label="Engedélyezett: új kampány létrehozása (nem ajánlott)" on={cfg.allow_create_campaign} onChange={(v) => set("allow_create_campaign", v)} />
      </div>

      <div className="card flex flex-col gap-2">
        <label className="text-sm font-semibold">Telegram chat azonosító</label>
        <input className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" value={cfg.telegram_chat_id || ""} onChange={(e) => set("telegram_chat_id", e.target.value)} placeholder="pl. 123456789" />
      </div>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Mentés…" : "Mentés"}</button>
        {msg && <span className="text-sm text-white/70">{msg}</span>}
      </div>
    </main>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`h-7 w-12 rounded-full transition ${on ? "bg-green-500" : "bg-white/20"}`}>
      <span className={`block h-6 w-6 translate-x-0.5 rounded-full bg-white transition ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}
function NumField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="card flex flex-col gap-1">
      <label className="text-sm text-white/70">{label}</label>
      <input type="number" step={step || 1} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
function CheckRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
