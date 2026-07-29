import nodemailer from "nodemailer";

interface SendMailOptions {
  to: string;
  cc?: string;
  subject: string;
  html: string;
}

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? "Fresh Prints ERP <noreply@freshprints.com>";

  if (!transporter) {
    // No SMTP configured — log to console in dev
    console.log("[EMAIL]", {
      from,
      to: opts.to,
      cc: opts.cc,
      subject: opts.subject,
    });
    return;
  }

  await transporter.sendMail({
    from,
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    html: opts.html,
  });
}
