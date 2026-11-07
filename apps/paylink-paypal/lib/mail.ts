import { createConsoleMailer, type Mailer, type OutboundEmail } from "@181hacks/paylink-core";
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
  // Demo reminders are local records only, even if mail credentials exist.
  // Sandbox reminders use PayPal alone; this app never adds a second email send.
  return createConsoleMailer(() => undefined);
}
