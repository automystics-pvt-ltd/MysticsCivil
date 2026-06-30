import nodemailer, { type Transporter } from "nodemailer";

let cached: { transporter: Transporter; from: string } | null | undefined = undefined;

function build(): { transporter: Transporter; from: string } | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;
  if (!host || !port || !from) return null;
  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return { transporter, from };
}

export function mailerConfigured(): boolean {
  if (cached === undefined) cached = build();
  return cached !== null;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; bounced?: boolean };

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<SendResult> {
  if (cached === undefined) cached = build();
  if (!cached) return { ok: false, error: "SMTP not configured (set SMTP_HOST, SMTP_PORT, SMTP_FROM)" };
  try {
    const info = await cached.transporter.sendMail({
      from: cached.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    const rejected = (info as any).rejected as string[] | undefined;
    if (rejected && rejected.length > 0) {
      return { ok: false, error: `Recipient rejected: ${rejected.join(", ")}`, bounced: true };
    }
    return { ok: true, messageId: info.messageId ?? "" };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const bounced = /\b(550|551|553|554|bounce|reject)/i.test(msg);
    return { ok: false, error: msg, bounced };
  }
}
