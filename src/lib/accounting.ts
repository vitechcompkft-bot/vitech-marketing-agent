import { supabaseAdmin } from "./supabase";
import { getMonthStatement } from "./bank";
import { buildStatementPdf, buildStatementXlsx } from "./bankExport";
import { sendMail } from "./mailer";
import { sendTelegram } from "./telegram";
import { sendAgentMessage } from "./teamComms";

/**
 * MIHÁLY HAVI KÖNYVELOI FELADATA: minden hónap 4-én lekéri az ELOZO hónap számlatörténetét (XLSX) +
 * kivonatát (PDF), és elküldi a könyvelonek emailben. A 4-i futtatást a monitor cron indítja (nap-ellenorzéssel).
 * A könyvelo címe: app_state "accountant_email" (vagy ACCOUNTANT_EMAIL env).
 */
const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";

function prevMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function setMihalyStatus(status: string, note: string): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.from("agent_status").upsert({ key: "mihaly", status, status_note: note, status_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    /* nem kritikus */
  }
}

async function accountantEmail(): Promise<string | null> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "accountant_email").maybeSingle();
    const v = (data?.value || process.env.ACCOUNTANT_EMAIL || "").trim();
    return v || null;
  } catch {
    return (process.env.ACCOUNTANT_EMAIL || "").trim() || null;
  }
}

export async function runAccountantEmail(opts?: { force?: boolean }): Promise<{ ok: boolean; reason?: string; month?: string; to?: string }> {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from("agent_config").select("agent_enabled").eq("id", 1).maybeSingle();
  if (cfg && !cfg.agent_enabled) return { ok: false, reason: "Az Agent ki van kapcsolva." };

  const month = prevMonth();
  const to = await accountantEmail();
  if (!to) return { ok: false, reason: "Nincs könyvelo email cím beállítva (accountant_email)." };

  // Havi egy: ha erre az (elozo) hónapra már elküldtük, kihagyjuk.
  const { data: mk } = await sb.from("app_state").select("value").eq("key", "accountant_last_sent").maybeSingle();
  if (!opts?.force && mk?.value === month) return { ok: false, reason: `A ${month} havi anyag már el lett küldve.` };

  await setMihalyStatus("working", `Könyvelési anyag összeállítása: ${month}…`);
  const stmt = await getMonthStatement(month);
  if (!stmt.ok) {
    await setMihalyStatus("error", `Banki kivonat hiba: ${stmt.note || ""}`);
    return { ok: false, reason: stmt.note || "Nem sikerült a havi kivonat lekérése." };
  }
  const [pdf, xlsx] = await Promise.all([buildStatementPdf(stmt), buildStatementXlsx(stmt)]);

  const r = await sendMail({
    to,
    subject: `Vitech Comp Kft. — ${month} számlatörténet és kivonat (könyveléshez)`,
    text:
      `Tisztelt Könyvelő!\n\n` +
      `Csatolva küldöm a ${month} havi banki anyagot a könyveléshez:\n` +
      `- Számlatörténet (Excel) — tételes\n- Számlakivonat (PDF)\n\n` +
      `Időszak: ${stmt.periodFrom} – ${stmt.periodTo}\n` +
      `Összes bevétel: ${ft(stmt.totalIn)}\nÖsszes kiadás: ${ft(stmt.totalOut)}\nTételek száma: ${stmt.transactions.length}\n\n` +
      `Üdvözlettel,\nVitech Comp Kft. (Mihály – Gazdasági osztály)`,
    attachments: [
      { filename: `vitech-szamlatortenet-${month}.xlsx`, content: xlsx, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { filename: `vitech-kivonat-${month}.pdf`, content: pdf, mime: "application/pdf" },
    ],
  });

  if (!r.ok) {
    await setMihalyStatus("error", `Email hiba: ${r.error}`);
    return { ok: false, reason: `Email küldési hiba: ${r.error}`, month, to };
  }

  await sb.from("app_state").upsert({ key: "accountant_last_sent", value: month, updated_at: new Date().toISOString() });
  await setMihalyStatus("done", `Könyvelési anyag elküldve (${month}) a könyvelonek.`);
  await sendAgentMessage("mihaly", "erika", "info", `Elküldtem a könyvelonek a ${month} havi számlatörténetet (Excel) és számlakivonatot (PDF). Bevétel ${ft(stmt.totalIn)}, kiadás ${ft(stmt.totalOut)}, ${stmt.transactions.length} tétel.`).catch(() => {});
  await sendTelegram(`📑 *Mihály — havi könyvelési anyag elküldve*\nHónap: ${month} · ${stmt.transactions.length} tétel\nCímzett: ${to}\nBevétel ${ft(stmt.totalIn)} · Kiadás ${ft(stmt.totalOut)}`).catch(() => {});
  return { ok: true, month, to };
}
