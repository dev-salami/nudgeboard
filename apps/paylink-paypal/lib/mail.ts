import { createConsoleMailer, createResendMailer, type Mailer, type OutboundEmail } from "@181hacks/paylink-core";
import { env } from "./env";
import { updateDb } from "./store";

export function sendMail(email: OutboundEmail & { invoiceId?: string }): Promise<{ provider: string; id: string }> {
  const mailer = pickMailer();
  return mailer.send(email).then((result) => {
    updateDb((db) => {
      db.emails.unshift({
        id: result.id,
        at: new Date().toISOString(),
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        provider: result.provider,
        invoiceId: email.invoiceId,
      });
      db.emails = db.emails.slice(0, 50);
    });
    return result;
  });
}

function pickMailer(): Mailer {
  const key = env("RESEND_API_KEY");
  if (key) return createResendMailer({ apiKey: key, from: env("RESEND_FROM", "PayLink <invoices@example.com>") });
  return createConsoleMailer(() => undefined);
}
