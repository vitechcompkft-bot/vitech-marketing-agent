import crypto from "crypto";
import { supabaseAdmin } from "./supabase";

/**
 * Enable Banking (open-banking / PSD2 AIS) kliens — K&H Magyarország.
 * Hitelesítés: RS256 JWT, a Control Panelben generált privát kulccsal (kid = Application ID).
 * Env: ENABLEBANKING_APP_ID, ENABLEBANKING_PRIVATE_KEY (PEM vagy base64(PEM)).
 * A session-t és a snapshotot az app_state táblában tároljuk (nincs külön séma).
 */
const BASE = "https://api.enablebanking.com";
const REDIRECT = (process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app") + "/api/bank/callback";

export function bankEnabled(): boolean {
  return !!(process.env.ENABLEBANKING_APP_ID && process.env.ENABLEBANKING_PRIVATE_KEY);
}

function privateKeyPem(): string {
  const raw = process.env.ENABLEBANKING_PRIVATE_KEY || "";
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  // base64-kódolt PEM támogatása (egysoros env változóhoz)
  try {
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return raw;
  }
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Rövid életű (1 órás) JWT az Enable Banking API-hoz. */
function ebJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "RS256", kid: process.env.ENABLEBANKING_APP_ID };
  const payload = { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKeyPem());
  return `${signingInput}.${b64url(sig)}`;
}

async function ebFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${ebJwt()}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`EB ${res.status}: ${(text || "").slice(0, 200)}`);
  return json;
}

/** K&H ASPSP megkeresése a HU listából (a pontos name a live válaszból). */
export async function findKH(): Promise<{ name: string; country: string; maxValiditySec: number } | null> {
  const j = await ebFetch("/aspsps?country=HU");
  const list: any[] = j?.aspsps || [];
  const kh =
    list.find((a) => /k&h|^kh$|kandh|kereskedelmi/i.test(a.name || "")) ||
    list.find((a) => (a.bic || "").toUpperCase().startsWith("OKHB"));
  if (!kh) return null;
  return { name: kh.name, country: kh.country || "HU", maxValiditySec: Number(kh.maximum_consent_validity || 90 * 86400) };
}

function validUntil(maxSec: number): string {
  const sec = Math.min(maxSec || 90 * 86400, 90 * 86400);
  const d = new Date(Date.now() + sec * 1000);
  return d.toISOString().replace("Z", "000+00:00"); // RFC3339 mikroszekundummal
}

/** 1. lépés: SCA-URL kérése (a felhasználó IBAN-jával). Visszaadja a banki belépési URL-t. */
export async function startBankAuth(iban: string): Promise<{ url: string; authorizationId: string }> {
  const kh = await findKH();
  if (!kh) throw new Error("K&H nem található az Enable Banking HU listájában.");
  const state = crypto.randomUUID();
  const body = {
    access: { valid_until: validUntil(kh.maxValiditySec), balances: true, transactions: true },
    aspsp: { name: kh.name, country: "HU" },
    redirect_url: REDIRECT,
    state,
    psu_type: "business",
    language: "hu",
    credentials: { iban: iban.replace(/\s+/g, "") },
  };
  const j = await ebFetch("/auth", { method: "POST", body: JSON.stringify(body) });
  // state mentése a callback-ellenorzéshez
  const sb = supabaseAdmin();
  await sb.from("app_state").upsert({ key: "bank_auth_state", value: state, updated_at: new Date().toISOString() });
  return { url: j.url, authorizationId: j.authorization_id };
}

/** 2. lépés: a visszairányítás code-jából session + számlák; eltároljuk. */
export async function finishBankAuth(code: string): Promise<{ sessionId: string; accounts: string[] }> {
  const j = await ebFetch("/sessions", { method: "POST", body: JSON.stringify({ code }) });
  const accounts: string[] = (j.accounts || []).map((a: any) => (typeof a === "string" ? a : a.uid || a.account_uid)).filter(Boolean);
  const sb = supabaseAdmin();
  await sb
    .from("app_state")
    .upsert({ key: "bank_session", value: JSON.stringify({ session_id: j.session_id, accounts }), updated_at: new Date().toISOString() });
  return { sessionId: j.session_id, accounts };
}

export interface BankSnapshot {
  ok: boolean;
  connected: boolean;
  balance: number | null;
  currency: string;
  in30: number;
  out30: number;
  recent: { date: string; amount: number; dir: "in" | "out"; party: string; info: string }[];
  /** 30 napos KIADÁS-bontás partnerenként (mire megy el a pénz) — Mihály ebbol elemez. */
  outByParty: { party: string; total: number; count: number }[];
  asOf: string | null;
  note?: string;
}

const EMPTY_SNAP: BankSnapshot = { ok: false, connected: false, balance: null, currency: "HUF", in30: 0, out30: 0, recent: [], outByParty: [], asOf: null };

/** Partnernév normalizálása a kiadás-csoportosításhoz (kisbetu, rövidítve). */
function partyKey(name: string): string {
  return (name || "").replace(/\s+/g, " ").trim().slice(0, 60) || "Egyéb";
}

/** Napi szinkron: egyenleg + utolsó 30 nap tranzakció → snapshot az app_state-be. */
export async function runBankSync(): Promise<BankSnapshot> {
  if (!bankEnabled()) return { ...EMPTY_SNAP, note: "Nincs ENABLEBANKING kulcs" };
  const sb = supabaseAdmin();
  const { data: row } = await sb.from("app_state").select("value").eq("key", "bank_session").maybeSingle();
  if (!row?.value) return { ...EMPTY_SNAP, note: "A bank még nincs összekötve (consent hiányzik)." };

  let session: { session_id: string; accounts: string[] };
  try {
    session = JSON.parse(row.value);
  } catch {
    return { ...EMPTY_SNAP, note: "Hibás bank-session." };
  }
  if (!session.accounts?.length) return { ...EMPTY_SNAP, note: "Nincs összekötött számla." };

  const dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = new Date().toISOString().slice(0, 10);

  try {
    let balance: number | null = null;
    let currency = "HUF";
    let in30 = 0;
    let out30 = 0;
    let balDebug = "";
    const recent: BankSnapshot["recent"] = [];
    const outMap = new Map<string, { party: string; total: number; count: number }>();

    const amtOf = (x: any) => x?.balance_amount || x?.balanceAmount || (x?.amount !== undefined ? x : null);

    for (const uid of session.accounts) {
      const bal = await ebFetch(`/accounts/${uid}/balances`).catch((e: any) => {
        balDebug = "balances hiba: " + (e?.message || "").slice(0, 120);
        return null;
      });
      const arr: any[] = bal?.balances || [];
      if (!balDebug && !arr.length) balDebug = "üres balances válasz: " + JSON.stringify(bal).slice(0, 160);
      const pref = ["CLBD", "ITBD", "ITAV", "CLAV", "XPCD", "OTHR", "PRCD", "OPBD"];
      const chosen = arr.find((x) => pref.includes(x.balance_type)) || arr[0];
      const a = amtOf(chosen);
      if (a && a.amount !== undefined) {
        balance = (balance || 0) + Number(a.amount || 0);
        currency = a.currency || currency;
      } else if (!balDebug && chosen) {
        balDebug = "ismeretlen balance-alak: " + JSON.stringify(chosen).slice(0, 160);
      }

      let contKey: string | undefined;
      let guard = 0;
      do {
        const q = `date_from=${dateFrom}&date_to=${dateTo}` + (contKey ? `&continuation_key=${encodeURIComponent(contKey)}` : "");
        const tx = await ebFetch(`/accounts/${uid}/transactions?${q}`);
        for (const t of tx.transactions || []) {
          const amt = Number(t.transaction_amount?.amount || 0);
          const dir = t.credit_debit_indicator === "CRDT" ? "in" : "out";
          const info = Array.isArray(t.remittance_information) ? t.remittance_information.join(" ") : t.remittance_information || "";
          const party = t.creditor?.name || t.debtor?.name || "—";
          if (dir === "in") in30 += amt;
          else {
            out30 += amt;
            // KIADÁS partnerenként összesítve (a címzett neve, ha nincs, a közlemény) → "mire megy el a pénz".
            const k = partyKey(t.creditor?.name || info || "Egyéb");
            const e = outMap.get(k.toLowerCase()) || { party: k, total: 0, count: 0 };
            e.total += amt;
            e.count++;
            outMap.set(k.toLowerCase(), e);
          }
          recent.push({ date: t.booking_date || t.value_date || "", amount: amt, dir, party, info });
        }
        contKey = tx.continuation_key || undefined;
      } while (contKey && ++guard < 10);
    }

    recent.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const outByParty = [...outMap.values()].sort((a, b) => b.total - a.total).slice(0, 12);
    const snap: BankSnapshot = {
      ok: true,
      connected: true,
      balance,
      currency,
      in30,
      out30,
      recent: recent.slice(0, 10),
      outByParty,
      asOf: new Date().toISOString(),
      note: balance === null ? "A K&H az AIS-en nem ad egyenleget — a forgalom (be/ki) és a tételek alapján elemzünk." : undefined,
    };
    await sb.from("app_state").upsert({ key: "bank_snapshot", value: JSON.stringify(snap), updated_at: new Date().toISOString() });
    return snap;
  } catch (e: any) {
    const msg = (e?.message || "").slice(0, 160);
    // 401/403 → lejárt consent → újra kell kötni
    const expired = /401|403|expired|invalid/i.test(msg);
    return { ...EMPTY_SNAP, connected: !expired, note: expired ? "A banki hozzáférés lejárt — újra össze kell kötni." : "Bank-szinkron hiba: " + msg };
  }
}

export interface MonthStatement {
  ok: boolean;
  periodFrom: string;
  periodTo: string;
  currency: string;
  totalIn: number;
  totalOut: number;
  transactions: { date: string; party: string; dir: "in" | "out"; amount: number; info: string }[];
  note?: string;
}

/** Egy hónap (vagy az aktuális hónap) ÖSSZES banki tétele — kivonathoz/számlatörténethez. month = "YYYY-MM". */
export async function getMonthStatement(month?: string): Promise<MonthStatement> {
  const now = new Date();
  let from: string;
  let to: string;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    from = `${month}-01`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    to = `${month}-${String(last).padStart(2, "0")}`;
  } else {
    from = now.toISOString().slice(0, 7) + "-01";
    to = now.toISOString().slice(0, 10);
  }
  const base: MonthStatement = { ok: false, periodFrom: from, periodTo: to, currency: "HUF", totalIn: 0, totalOut: 0, transactions: [] };
  if (!bankEnabled()) return { ...base, note: "Nincs banki kulcs." };
  const sb = supabaseAdmin();
  const { data: row } = await sb.from("app_state").select("value").eq("key", "bank_session").maybeSingle();
  if (!row?.value) return { ...base, note: "A bank nincs összekötve." };
  let session: { session_id: string; accounts: string[] };
  try {
    session = JSON.parse(row.value);
  } catch {
    return { ...base, note: "Hibás bank-session." };
  }
  if (!session.accounts?.length) return { ...base, note: "Nincs összekötött számla." };

  try {
    let totalIn = 0;
    let totalOut = 0;
    let currency = "HUF";
    const transactions: MonthStatement["transactions"] = [];
    for (const uid of session.accounts) {
      let contKey: string | undefined;
      let guard = 0;
      do {
        const q = `date_from=${from}&date_to=${to}` + (contKey ? `&continuation_key=${encodeURIComponent(contKey)}` : "");
        const tx = await ebFetch(`/accounts/${uid}/transactions?${q}`);
        for (const t of tx.transactions || []) {
          const amt = Number(t.transaction_amount?.amount || 0);
          currency = t.transaction_amount?.currency || currency;
          const dir = t.credit_debit_indicator === "CRDT" ? "in" : "out";
          const info = Array.isArray(t.remittance_information) ? t.remittance_information.join(" ") : t.remittance_information || "";
          const party = t.creditor?.name || t.debtor?.name || "—";
          if (dir === "in") totalIn += amt;
          else totalOut += amt;
          transactions.push({ date: t.booking_date || t.value_date || "", party, dir: dir as "in" | "out", amount: amt, info });
        }
        contKey = tx.continuation_key || undefined;
      } while (contKey && ++guard < 25);
    }
    transactions.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return { ok: true, periodFrom: from, periodTo: to, currency, totalIn, totalOut, transactions };
  } catch (e: any) {
    const msg = (e?.message || "").slice(0, 160);
    const expired = /401|403|expired|invalid/i.test(msg);
    return { ...base, note: expired ? "A banki hozzáférés lejárt — újra össze kell kötni." : "Bank-hiba: " + msg };
  }
}

/** A tárolt snapshot (dashboardhoz/Mihályhoz). */
export async function getBankSnapshot(): Promise<BankSnapshot> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "bank_snapshot").maybeSingle();
    if (!data?.value) {
      const { data: sess } = await sb.from("app_state").select("value").eq("key", "bank_session").maybeSingle();
      return { ...EMPTY_SNAP, connected: !!sess?.value, note: sess?.value ? "Még nincs szinkron." : "Nincs összekötve." };
    }
    return JSON.parse(data.value) as BankSnapshot;
  } catch {
    return EMPTY_SNAP;
  }
}
