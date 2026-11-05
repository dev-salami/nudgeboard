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

Then open the pay link it prints, choose PayPal or card, and pay. The merchant overview polls and shows the invoice as paid. Inbox on `/inbox` accepts an email-style paste and a WhatsApp-style paste. Those adapters are stubs. They do not connect to a mailbox or to WhatsApp.

```bash
pnpm --filter paylink-paypal test
pnpm --filter paylink-paypal typecheck
pnpm --filter paylink-paypal build
```

`pnpm dev:paypal` from the root is the same dev server.

## Environment

Copy [`.env.example`](./.env.example) to `apps/paylink-paypal/.env.local` or the repo-root `.env`. Names only. Do not commit values.

| Name | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID` | Sandbox REST app client id. Empty means demo mode. |
| `PAYPAL_CLIENT_SECRET` | Sandbox REST secret. Empty means demo mode. |
| `PAYPAL_ENVIRONMENT` | `sandbox` (default) or `live`. This entry is sandbox. |
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

## What the loop does

1. The merchant talks to the agent, or pastes a request. The same tool names as PayLink core are used: `create_invoice`, `check_status`, `list_unpaid`, `send_reminder`.
2. The PayPal provider creates a draft invoice (`POST /v2/invoicing/invoices`) and, unless it is a draft, sends it (`POST /v2/invoicing/invoices/{id}/send`).
3. The payer opens `/pay/{id}`: summary, payment method, then pay. Demo mode records a simulated capture. Sandbox mode opens the hosted PayPal invoice.
4. A paid webhook, a sync, or the demo capture marks the invoice paid and writes a receipt at `/receipts/{id}`.
5. Reminders call PayPal's remind endpoint and log the email. Paid and draft invoices are refused before that call.

The core `CreatePaymentInput.currency` field is typed `"USDC"` because that was the first rail. This provider settles the decimal amount in USD and reports `asset: "USD"`. That adaptation lives in `lib/provider.ts`.

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
