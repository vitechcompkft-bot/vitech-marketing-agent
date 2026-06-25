import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { supabaseAdmin } from "./supabase";
import { erikaTriageEmail, gyulaAnalyzeEmail } from "./claude";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";

export interface InboxResult {
  ok: boolean;
  checked: number;
  added: number;
  reason?: string;
  per?: { mailbox: string; checked: number; added: number; reason?: string }[];
}

interface MailboxCfg {
  key: string;
  label: string;
  host: string;
  port: number;
  user: string;
  pass: string;
}

/** A beállított postaládák (env alapján): HUNOR (DotRoll IMAP) + Vitech (Gmail IMAP). */
function mailboxes(): MailboxCfg[] {
  const list: MailboxCfg[] = [];
  if (process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS) {
    list.push({
      key: "hunor",
      label: process.env.IMAP_USER,
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT || 993),
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    });
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    list.push({
      key: "vitech",
      label: process.env.GMAIL_USER,
      host: "imap.gmail.com",
      port: 993,
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    });
  }
  return list;
}

async function checkOneMailbox(cfg: MailboxCfg, limit: number): Promise<{ checked: number; added: number; reason?: string }> {
  const sb = supabaseAdmin();
  const { data: er } = await sb.from("agents").select("persona").eq("key", "erika").single();
  const erikaPersona = er?.persona || "Lojális, rendszereto titkárno.";

  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  let checked = 0;
  let added = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages || 0;
      if (!total) return { checked: 0, added: 0 };

      // 1. menet: CSAK fejlécek (gyors) az utolsó ~10 levélbol.
      const start = Math.max(1, total - 9);
      const metas: { uid: number; envelope: any }[] = [];
      for await (const m of client.fetch(`${start}:*`, { envelope: true, uid: true })) {
        metas.push({ uid: m.uid as number, envelope: m.envelope });
      }
      checked = metas.length;

      // A legújabbtól indulva kiválasztjuk az ÚJ (DB-ben még nem szereplo) leveleket, max `limit` db.
      const fresh: { uid: number; envelope: any }[] = [];
      for (const meta of metas.reverse()) {
        const uidKey = `${cfg.key}:${meta.uid}`;
        const { data: exists } = await sb.from("emails").select("id").eq("uid", uidKey).limit(1);
        if (exists && exists.length) continue;
        fresh.push(meta);
        if (fresh.length >= limit) break;
      }

      // 2. menet: CSAK az új leveleknél töltjük le a törzset + futtatunk AI-t.
      for (const meta of fresh) {
        const uid = `${cfg.key}:${meta.uid}`;
        let from = meta.envelope?.from?.[0]?.address || "";
        let subject = meta.envelope?.subject || "(nincs tárgy)";
        let body = "";
        try {
          const one = await client.fetchOne(String(meta.uid), { source: true }, { uid: true });
          if (one && (one as any).source) {
            const parsed = await simpleParser((one as any).source as Buffer);
            from = from || parsed.from?.text || "";
            subject = subject || parsed.subject || "(nincs tárgy)";
            body = (parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "") || "").replace(/\s+/g, " ").trim();
          }
        } catch {
          /* tárgyból triázsolunk */
        }
        const date = meta.envelope?.date ? new Date(meta.envelope.date) : new Date();
        const triage = await erikaTriageEmail({ from, subject, body }, erikaPersona);

        // ROUTE: IT/AI → Gyula; minden más → Erika.
        let gyulaNote: string | null = null;
        let isShop = false;
        let notified = false;
        const short = `📧 ${from}\n📌 ${subject}`;

        if (triage.route === "gyula") {
          const g = await gyulaAnalyzeEmail({ from, subject, body });
          isShop = g.isShop;
          gyulaNote = g.problem;
          // Gyula a BOLTI ügyeket jelzi Telegramon a tulajdonosnak.
          if (isShop) {
            await sendTelegram(`🛠️ *Gyula — bolti IT-probléma*\n${short}\n\n${g.problem}`).catch(() => {});
            notified = true;
          }
          await setAgentStatus(
            "gyula",
            "working",
            isShop ? `Bolti IT-ügy: ${subject.slice(0, 40)}` : `IT/AI e-mail elemezve: ${subject.slice(0, 36)}`
          );
        } else if (triage.notify) {
          // Erika a saját (érdemi) ügyeit jelzi Telegramon.
          await sendTelegram(`📨 *Erika — új e-mail* (${triage.urgency})\n${short}\n\n${triage.summary}`).catch(() => {});
          notified = true;
        }

        await sb.from("emails").insert({
          uid,
          mailbox: cfg.label,
          from_addr: from,
          subject,
          date: date.toISOString(),
          snippet: body.slice(0, 200),
          summary: triage.summary,
          department: triage.route === "gyula" ? "Informatika" : triage.department,
          urgency: triage.urgency,
          route: triage.route,
          gyula_note: gyulaNote,
          is_shop: isShop,
          notified,
        });
        added++;
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { checked, added };
  } catch (e: any) {
    try {
      await client.logout();
    } catch {}
    return { checked, added, reason: (e?.message || "IMAP hiba").slice(0, 160) };
  }
}

/** Minden beállított postaláda ellenorzése (csak olvasás). */
export async function checkInbox(limit = 5): Promise<InboxResult> {
  const boxes = mailboxes();
  if (!boxes.length) return { ok: false, checked: 0, added: 0, reason: "Nincs beállított postaláda (env)." };

  let checked = 0;
  let added = 0;
  const per: { mailbox: string; checked: number; added: number; reason?: string }[] = [];
  for (const box of boxes) {
    const r = await checkOneMailbox(box, limit);
    checked += r.checked;
    added += r.added;
    per.push({ mailbox: box.label, checked: r.checked, added: r.added, reason: r.reason });
  }
  if (added > 0) await setAgentStatus("erika", "working", `${added} új e-mail rendezve a postaládá(k)ból.`);
  return { ok: true, checked, added, per };
}

/**
 * A Vitech Gmail-bol a legutóbbi RENDELÉS-értesíto e-mailek TELJES szövege (a garancia-app számára).
 * Így a helyi garancia-app a MÁR bekötött Gmail-bol kapja az adatot, külön jelszó nélkül.
 */
export async function fetchOrderEmails(limit = 15): Promise<{ subject: string; from: string; body: string }[]> {
  const boxes = mailboxes().filter((b) => b.key === "vitech");
  const out: { subject: string; from: string; body: string }[] = [];
  for (const cfg of boxes) {
    const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const status = await client.status("INBOX", { messages: true });
        const total = status.messages || 0;
        if (!total) continue;
        const start = Math.max(1, total - (limit - 1));
        for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true, uid: true })) {
          const subject = msg.envelope?.subject || "";
          let body = "";
          try {
            const parsed = await simpleParser(msg.source as Buffer);
            body = (parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "") || "").replace(/\r\n/g, "\n");
          } catch {
            /* tárgyból nem tudunk garancialevelet csinálni — kihagyjuk */
          }
          const hay = (subject + " " + body).toLowerCase();
          if (hay.includes("megrendel") && body.toLowerCase().includes("megrendelt term")) {
            out.push({ subject, from: msg.envelope?.from?.[0]?.address || "", body });
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch {
      try {
        await client.logout();
      } catch {}
    }
  }
  return out;
}
