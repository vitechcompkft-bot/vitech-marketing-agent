import nodemailer from "nodemailer";

/**
 * Email-küldés a céges Gmailen át (GMAIL_USER + GMAIL_APP_PASSWORD — ugyanaz, mint Erika IMAP-olvasásához).
 * Csatolmánnyal is (PDF/DOCX/XLSX). A tulajdonos címe: OWNER_EMAIL (alap: vitechcompkft@gmail.com).
 */
export function ownerEmail(): string {
  return process.env.OWNER_EMAIL || process.env.GMAIL_USER || "vitechcompkft@gmail.com";
}

export async function sendMail(opts: {
  to?: string;
  subject: string;
  text: string;
  filename?: string;
  content?: Buffer;
  mime?: string;
  attachments?: { filename: string; content: Buffer; mime?: string }[];
}): Promise<{ ok: boolean; error?: string }> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, error: "Hiányzó GMAIL_USER / GMAIL_APP_PASSWORD env." };
  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    const atts = opts.attachments
      ? opts.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.mime }))
      : opts.filename && opts.content
      ? [{ filename: opts.filename, content: opts.content, contentType: opts.mime }]
      : undefined;
    await transporter.sendMail({
      from: `Vitech AI csapat <${user}>`,
      to: opts.to || ownerEmail(),
      subject: opts.subject,
      text: opts.text,
      attachments: atts,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "ismeretlen hiba" };
  }
}
