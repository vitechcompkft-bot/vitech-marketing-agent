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
}

/**
 * Beérkezo e-mailek olvasása IMAP-pal (CSAK olvasás — nem töröl, nem küld).
 * Erika triázsolja (összegzés, osztály, sürgosség) és tárolja az 'emails' táblába.
 * Beállítás: IMAP_HOST, IMAP_PORT (alap 993), IMAP_USER, IMAP_PASS env.
 */
export async function checkInbox(limit = 5): Promise<InboxResult> {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  if (!host || !user || !pass) return { ok: false, checked: 0, added: 0, reason: "Hiányzó IMAP beállítás (env)." };

  const port = Number(process.env.IMAP_PORT || 993);
  const sb = supabaseAdmin();
  const { data: er } = await sb.from("agents").select("persona").eq("key", "erika").single();
  const erikaPersona = er?.persona || "Lojális, rendszereto titkárno.";

  const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
  let checked = 0;
  let added = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages || 0;
      if (!total) return { ok: true, checked: 0, added: 0 };
      const start = Math.max(1, total - 11); // utolsó ~12 levél

      for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true, uid: true })) {
        checked++;
        const uid = String(msg.uid);
        const { data: exists } = await sb.from("emails").select("id").eq("uid", uid).limit(1);
        if (exists && exists.length) continue; // már feldolgozva
        if (added >= limit) continue; // triázs-korlát futásonként

        let from = msg.envelope?.from?.[0]?.address || "";
        let subject = msg.envelope?.subject || "(nincs tárgy)";
        let body = "";
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          from = from || parsed.from?.text || "";
          subject = subject || parsed.subject || "(nincs tárgy)";
          body = (parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "") || "").replace(/\s+/g, " ").trim();
        } catch {
          // ha a body nem értelmezheto, a tárgyból triázsolunk
        }
        const date = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();
        const triage = await erikaTriageEmail({ from, subject, body }, erikaPersona);

        await sb.from("emails").insert({
          uid,
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
    if (added > 0) await setAgentStatus("erika", "working", `${added} új e-mail rendezve a postaládából.`);
    return { ok: true, checked, added };
  } catch (e: any) {
    try {
      await client.logout();
    } catch {}
    return { ok: false, checked, added, reason: (e?.message || "IMAP hiba").slice(0, 180) };
  }
}
