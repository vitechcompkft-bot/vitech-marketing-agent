import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { supabaseAdmin } from "./supabase";
import { erikaTriageEmail } from "./claude";
import { setAgentStatus } from "./team";

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
      const start = Math.max(1, total - 11);
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true, uid: true })) {
        checked++;
        const uid = `${cfg.key}:${msg.uid}`;
        const { data: exists } = await sb.from("emails").select("id").eq("uid", uid).limit(1);
        if (exists && exists.length) continue;
        if (added >= limit) continue;

        let from = msg.envelope?.from?.[0]?.address || "";
        let subject = msg.envelope?.subject || "(nincs tárgy)";
        let body = "";
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          from = from || parsed.from?.text || "";
          subject = subject || parsed.subject || "(nincs tárgy)";
          body = (parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "") || "").replace(/\s+/g, " ").trim();
        } catch {
          /* tárgyból triázsolunk */
        }
        const date = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        const triage = await erikaTriageEmail({ from, subject, body }, erikaPersona);
        await sb.from("emails").insert({
          uid,
          mailbox: cfg.label,
          from_addr: from,
          subject,
          date: date.toISOString(),
          snippet: body.slice(0, 200),
          summary: triage.summary,
          department: triage.department,
          urgency: triage.urgency,
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
