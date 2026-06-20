import type { AgentConfig, AgentDecision, CampaignMetric } from "./types";

export interface GuardrailResult {
  /** Végrehajtható-e (a guardrails szerint)? */
  permitted: boolean;
  /** Esetleg módosított (clamp-elt) paraméterek. */
  params: Record<string, unknown>;
  /** Ha tiltott vagy módosított: miért. */
  note: string;
}

/**
 * A biztonsági réteg. A Claude döntését megszűri/korlátozza a beállított korlátok szerint.
 * Ez a "kemény" védelem — sosem engedi át, amit a config tilt.
 */
export function enforceGuardrails(
  decision: AgentDecision,
  metric: CampaignMetric | undefined,
  config: AgentConfig
): GuardrailResult {
  // 0) Vész-leállító
  if (!config.agent_enabled) {
    return { permitted: false, params: decision.params, note: "Az Agent ki van kapcsolva (vész-leállító)." };
  }

  switch (decision.action) {
    case "note":
      return { permitted: false, params: decision.params, note: "Megfigyelés — nincs beavatkozás." };

    case "budget_change": {
      if (!config.allow_budget_changes)
        return { permitted: false, params: decision.params, note: "Keret-módosítás tiltva a beállításokban." };

      const current = metric?.budget_huf ?? 0;
      let to = Number(decision.params?.to ?? 0);
      if (!to || to <= 0)
        return { permitted: false, params: decision.params, note: "Érvénytelen célkeret." };

      // Kevés adat → ne nyúljunk hozzá
      if (metric && metric.clicks < config.min_data_clicks)
        return {
          permitted: false,
          params: decision.params,
          note: `Túl kevés adat (${metric.clicks} kattintás < ${config.min_data_clicks}) — várunk a keret-módosítással.`,
        };

      // Lépésköz korlát (max % változás egy lépésben)
      const maxStep = current * (config.max_budget_change_pct / 100);
      const upper = current + maxStep;
      const lower = Math.max(0, current - maxStep);
      let clamped = Math.min(Math.max(to, lower), upper || to);

      // Abszolút felső plafon
      if (clamped > config.max_daily_budget_huf) clamped = config.max_daily_budget_huf;

      const noteParts: string[] = [];
      if (clamped !== to) noteParts.push(`korlátozva ${to}->${clamped} Ft`);
      if (clamped === current)
        return { permitted: false, params: { to: clamped }, note: `Nincs tényleges változás (${current} Ft).` };

      return {
        permitted: true,
        params: { from: current, to: Math.round(clamped) },
        note: noteParts.join("; ") || "Keret-módosítás a korlátokon belül.",
      };
    }

    case "pause_ad": {
      if (!config.allow_pause_ads)
        return { permitted: false, params: decision.params, note: "Szüneteltetés tiltva a beállításokban." };
      if (metric && metric.clicks < config.min_data_clicks)
        return {
          permitted: false,
          params: decision.params,
          note: `Túl kevés adat a szüneteltetéshez (${metric.clicks} < ${config.min_data_clicks}).`,
        };
      return { permitted: true, params: decision.params, note: "Szüneteltetés engedélyezett." };
    }

    case "enable_ad": {
      if (!config.allow_pause_ads)
        return { permitted: false, params: decision.params, note: "Kampány-állapot váltás tiltva a beállításokban." };
      return { permitted: true, params: decision.params, note: "Újraindítás engedélyezett." };
    }

    case "set_target_roas": {
      const to = Number(decision.params?.to ?? 0);
      if (to <= 0) return { permitted: false, params: decision.params, note: "Érvénytelen ROAS-cél." };
      return { permitted: true, params: { to }, note: "ROAS-cél beállítható." };
    }

    case "add_sitelinks": {
      const arr = Array.isArray(decision.params?.sitelinks) ? (decision.params.sitelinks as any[]) : [];
      if (!arr.length) return { permitted: false, params: decision.params, note: "Nincs sitelink tartalom." };
      // Alacsony kockázat (nincs költséghatás), de jóváhagyás után a szkript teszi be.
      return { permitted: true, params: decision.params, note: `Sitelink-javaslat (${arr.length} db) — alacsony kockázat.` };
    }

    case "add_callouts": {
      const arr = Array.isArray(decision.params?.callouts) ? (decision.params.callouts as any[]) : [];
      if (!arr.length) return { permitted: false, params: decision.params, note: "Nincs kiemelo tartalom." };
      return { permitted: true, params: decision.params, note: `Kiemelo-javaslat (${arr.length} db) — alacsony kockázat.` };
    }

    default:
      return { permitted: false, params: decision.params, note: "Ismeretlen vagy tiltott akciótípus." };
  }
}
