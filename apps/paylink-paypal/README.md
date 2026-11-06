# PayLink PayPal

AI invoicing and collections agent for freelancers. It reads a job request, drafts a USD invoice, creates and sends it through the PayPal Invoicing API, and chases whatever is still open. The payer pays on a PayPal-hosted invoice. In demo mode that checkout is simulated on our pay page, and the merchant book updates the same way.

This is the PayPal entry in the private `181hacks` monorepo. It is aimed at Best Agentic Commerce and Best PayPal + AI. PayPal is the payment rail: create, send, remind, fetch, and webhook verification all go through the Invoicing API. There is no Solana, x402, or Nimiq code in this app.

The PayPal AI Hackathon opened on 1 October 2026. The shared invoicing core in `packages/paylink-core` was written in this repo during that window for the Solana PayLink entry: invoice domain, agent tool names, date parsing, money, and the reminder guard. This app is the PayPal slice of that work. It implements `PaymentProvider` inside the app, adds the sandbox client, the collections chat, the inbox adapters, and the payer flow. PayPal-specific types stay here. They are not added to `paylink-core`.

A self-contained public submission repo will be extracted from this app and `packages/paylink-core` later. Do not create that repository from this tree. This monorepo stays private. No Devpost registration and no PayPal developer account are part of this change.

Licensed under MIT. See [LICENSE](./LICENSE). No API keys belong in git.

## Run

From the monorepo root:

```bash
pnpm install
pnpm --filter paylink-paypal dev
```

Open http://localhost:3030.

Demo mode is the default. Leave `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` empty. The agent still creates an invoice, the pay page still completes a simulated PayPal or card checkout, and the dashboard updates. The webhook route accepts a well-formed `INVOICING.INVOICE.*` event without a live signature.

Try this in the agent:

```text
Invoice Ada Lovelace ada@example.com 480 USD for the spring logo, due Friday
```

Then open the pay link it prints, choose PayPal or card, and pay. The merchant overview polls and shows the invoice as paid. Inbox on `/inbox` accepts an email-style paste and a WhatsApp-style paste. With an LLM key these requests are extracted by the configured model (including relative due dates); without a key the deterministic parser remains available. These are paste adapters, not mailbox or WhatsApp connections.

AI examples:

```text
Invoice Ada Lovelace ada@example.com 480 USD for the spring logo, due Friday
Draft a friendly overdue reminder for Ada Lovelace
Draft a firm reminder for PP-2026-1041
Draft an empathetic reminder for Ada Lovelace
Summarize receivables
```

Reminder previews are **draft-only**: no PayPal reminder or email is sent. Facts and pay links are appended from the stored invoice, and paid/draft invoices are refused. Sending still requires a separate explicit reminder command/action. A status lookup checks PayPal before drafting or sending a sandbox reminder. The summary computes ledger totals locally (subtracting recorded partial payments), excludes sample/paid/cancelled/refunded rows, and asks the model for collection priorities. LLM failures fall back to deterministic parsing/text. AI never supplies a paid status or transaction id.

```bash
pnpm --filter paylink-paypal test
pnpm --filter paylink-paypal typecheck
pnpm --filter paylink-paypal build
```

`pnpm dev:paypal` from the root is the same dev server.

## Environment

For local Next.js development, copy [`.env.example`](./.env.example) to `apps/paylink-paypal/.env.local`, or export the variables in your shell. Next.js does not automatically load a monorepo-root `.env` for this app. Never commit values. Node.js 22+ and pnpm 10 are required.

| Name | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID` | Sandbox REST app client id. Empty means demo mode. |
| `PAYPAL_CLIENT_SECRET` | Sandbox REST secret. Empty means demo mode. |
| `PAYPAL_ENVIRONMENT` | `sandbox` only (default). Any other value is rejected; no live fallback. |
| `PAYPAL_MODE` | Optional `demo` to force the simulated rail even with sandbox credentials. |
| `PAYPAL_WEBHOOK_ID` | Required before a real webhook is trusted. |
| `PAYPAL_MERCHANT_EMAIL` | Sandbox business email on that REST app. PayPal rejects a send when this does not match the credentials. |
| `MERCHANT_NAME` | Shown on invoices and the pay page. |
| `MERCHANT_CITY` | Merchant profile. |
| `MERCHANT_EMAIL` | Used when `PAYPAL_MERCHANT_EMAIL` is empty. |
| `APP_URL` | Public origin baked into pay links. |
| `PAYLINK_DEMO_MODE` | `1` keeps the agent on the rule parser. `0` plus `LLM_API_KEY` uses the model. |
| `LLM_API_KEY` | Optional OpenAI-compatible key. |
| `LLM_BASE_URL` | Defaults to `https://api.openai.com/v1`. |
| `LLM_MODEL` | Defaults to `gpt-4o-mini`. |
| `RESEND_API_KEY` | Optional. Without it, reminders are stored in the app. |
| `RESEND_FROM` | From address for Resend. |
| `DATA_DIR` | JSON store directory. Docker uses `/data`. |

PayPal demo mode follows the credentials, not `PAYLINK_DEMO_MODE`. That flag only chooses the agent parser versus a model. With credentials set, create, send, get, and remind call `https://api-m.sandbox.paypal.com`. The payer page then continues to PayPal's hosted invoice (`recipient_view_url`). "I've paid" syncs with `GET /v2/invoicing/invoices/{id}`. Webhooks are applied only after `POST /v1/notifications/verify-webhook-signature` returns `SUCCESS`.

### Sandbox setup (operator-run only)

1. In the PayPal developer sandbox, use a REST app associated with a sandbox **business** merchant, and a separate sandbox **personal** buyer. Put the REST app id/secret in the two `PAYPAL_CLIENT_*` variables and the associated business email in `PAYPAL_MERCHANT_EMAIL`. Never use live credentials or real customer addresses.
2. Keep `PAYPAL_ENVIRONMENT=sandbox`. Set `APP_URL=http://localhost:3030` for local use. For AI, export `LLM_API_KEY` and optionally `LLM_BASE_URL`/`LLM_MODEL`; leave `PAYLINK_DEMO_MODE` unset or set it to `0`.
3. Start the app. **Creating a non-draft invoice with these credentials sends a sandbox invoice email.** To avoid sending, ask to create an invoice **as a draft**. Sending is an explicit separate merchant action.
4. If authorized to exercise the complete sandbox flow, send to the sandbox buyer, open the payer link and finish on PayPal. The app never accepts card numbers, performs a capture, or treats a browser redirect as proof of payment. Card availability is controlled by PayPal, not guaranteed by the method selector.
5. Keep the merchant dashboard or payer page open: sandbox polling queries the remote invoice, updates its PayPal status and writes one receipt when paid. Manual sync is also available. Optional verified webhooks can accelerate updates; no webhook configuration is needed for polling.

OAuth is cached in memory with a 15-second expiry margin, concurrent refresh coalescing, and one refresh/retry on HTTP 401. Calls have timeouts and reject redirects. Drafts carry stable request ids; the local draft stores its remote id **before** attempting send, so a send failure retains the same draft for retry. A failed send is not a successful invoice. After an ambiguous timeout, inspect/sync the draft before retrying. Errors never silently switch to demo mode.

### Explicit, guarded smoke script

The script uses Node's built-ins, needs no new dependencies, and **does not load env files**. Export variables in your own authorized shell; never paste values into commands committed to git. Default behavior obtains an OAuth token and lists up to five invoices visible to that sandbox merchant. This is the account-scoped Invoicing permission check: PayPal REST app credentials have no general “list accounts” endpoint. Only success/counts are printed, never credentials, tokens, recipients, invoice ids, or API response bodies.

```bash
# Read-only invoice access (OAuth POST is authentication, not an invoice mutation):
pnpm --filter paylink-paypal smoke:sandbox

# Help only; no credentials or requests needed:
pnpm --filter paylink-paypal smoke:sandbox --help

# MUTATION: explicitly create a sandbox draft; does NOT send:
pnpm --filter paylink-paypal smoke:sandbox --create-draft \
  --merchant-email sandbox-business@example.test \
  --recipient-email sandbox-buyer@example.test --amount 1.00
```

Replace example addresses only with your developer sandbox accounts. Sending is deliberately omitted from the safe examples: it additionally requires **both** `--send` and `--confirm-sandbox-send` on the same `--create-draft` command. Incomplete/unknown flags fail before authentication. The script never pays, captures, auto-retries a mutation, or follows redirects. Do not run mutation flags without explicit authorization. This implementation session ran **no** real smoke requests, invoice creations, sends, or payments.

## What the loop does

1. The merchant talks to the agent, or pastes a request. The same tool names as PayLink core are used: `create_invoice`, `check_status`, `list_unpaid`, `send_reminder`.
2. The PayPal provider creates a draft invoice (`POST /v2/invoicing/invoices`) and, unless it is a draft, sends it (`POST /v2/invoicing/invoices/{id}/send`).
3. The payer opens `/pay/{id}`: summary, payment method, then pay. Demo mode records a simulated capture. Sandbox mode opens the hosted PayPal invoice.
4. A paid webhook, a remote poll/manual sync, or the demo capture marks the invoice paid and writes a receipt at `/receipts/{id}`. Dashboard polling checks at most five due rows per request, with a 15-second per-invoice cooldown; payer polling checks every 15 seconds. Polling is browser-driven, not a background scheduler.
5. Reminders call PayPal's remind endpoint and log the email. Paid and draft invoices are refused before that call.

The core `CreatePaymentInput.currency` field is typed `"USDC"` because that was the first rail. This provider settles the decimal amount in USD and reports `asset: "USD"`. That adaptation lives in `lib/provider.ts`.

## Work since 1 October 2026 / verification

Repository history records the shared PayLink core on **4 November** (`ab88cba`), its paid-reminder guard on **4 November** (`d5a5c77`), and the PayPal scaffold on **5 November** (`9de8dc1`), all after 1 October. The shared core is reused, not represented as newly written in this sandbox integration. This task adds sandbox-only host enforcement, OAuth refresh/error handling, draft/send recovery, real status polling and receipts, model-based paste extraction, tone-aware reminder previews, grounded receivables summaries, and the guarded smoke script. PayPal-specific work stays inside this app; the Keel light-grey/white, near-black `#181C25`, mint `#71FC8F`, Degular payer styling is preserved.

Focused mocked tests cover draft → send → payer link → paid receipt, OAuth cache/concurrent expiry refresh/401, API failures, overdue/partial/zero payment states, no-env demo, model extraction/fallback, reminder tones/refusals, summaries, and smoke mutation guards. Test setup blocks unmocked `fetch` and clears payment/model/mail credential env names. No test requires credentials or sends external messages.

**Handoff:** tests/typecheck/build were not executable in the coding container: Node.js and pnpm are absent. No runtime was installed. Run the three commands in the Run section on the reviewer box. Real PayPal account permissions, sandbox delivery/payment, model quality, and browser visuals remain unverified; mocked tests cannot establish those. This is a local hackathon prototype, not an authenticated multi-tenant production billing service. Receipt status is monotonic once paid; subsequent refunds/reversals require further reconciliation work.

## Deploy shape

Not deployed from this change.

- `Dockerfile` is a standalone Next.js image, same two-stage shape as the Solana app, listening on port 3030.
- `deploy/compose.yaml` is a Traefik service for `paypal.181labs.build`. It expects an env file outside git.

```bash
docker build -f apps/paylink-paypal/Dockerfile -t paylink-paypal .
```

## Layout

```
app/                  Landing, agent, books, inbox, pay page, receipt
app/api/              Chat, invoices, pay, sync, remind, PayPal webhook
lib/paypal-client.ts  OAuth, invoicing calls, demo rail, webhook verify
lib/provider.ts       PaymentProvider for PayPal
lib/agent.ts          Natural-language create, list, and chase
lib/ingest.ts         Email-style and WhatsApp-style stubs
deploy/compose.yaml   Host shape only. Not applied.
```
