# PayLink PayPal

AI invoicing and collections agent for freelancers. It reads a job request and saves a **local USD draft and structured preview**. Only a separate explicit confirmation can create/send a sandbox invoice or send a reminder. The payer pays on a PayPal-hosted invoice. In demo mode checkout is simulated on our pay page.

This is the PayPal entry in the private `181hacks` monorepo. It is aimed at Best Agentic Commerce and Best PayPal + AI. PayPal is the payment rail: create, send, remind, fetch, and webhook verification all go through the Invoicing API. There is no Solana, x402, or Nimiq code in this app.

The PayPal AI Hackathon opened on 1 October 2026. The shared invoicing core in `packages/paylink-core` was written in this repo during that window for the Solana PayLink entry: invoice domain, agent tool names, date parsing, money, and the reminder guard. This app is the PayPal slice of that work. It implements `PaymentProvider` inside the app, adds the sandbox client, the collections chat, the inbox adapters, and the payer flow. PayPal-specific types stay here. They are not added to `paylink-core`.

A self-contained public submission repo will be extracted from this app and `packages/paylink-core` later. Do not create that repository from this tree. This monorepo stays private. No Devpost registration and no PayPal developer account are part of this change.

Application code is licensed under MIT. See [LICENSE](./LICENSE). No API keys belong in git. The UI self-hosts [Instrument Sans](./app/fonts/README.md) under the SIL Open Font License 1.1; Degular is not included.

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

Review the structured preview, then click **Confirm invoice send** separately. Only then open the pay link, choose PayPal or card, and complete the demo payment. Inbox on `/inbox` accepts email-style and WhatsApp-style pastes as local drafts only, using the deterministic parser even when a model key exists. These are paste adapters, not mailbox or WhatsApp connections.

AI examples:

```text
Invoice Ada Lovelace ada@example.com 480 USD for the spring logo, due Friday
Draft a friendly overdue reminder for Ada Lovelace
Draft a firm reminder for PP-2026-1041
Draft an empathetic reminder for Ada Lovelace
Summarize receivables
```

Invoice send previews and paste extraction are **local-only**. Reminder preview preparation may call the configured AI provider, but never PayPal or mail. Explicit `draft`/`preview` intent parsing stays deterministic. Other free-form interpretation can call the configured model, but its tools only propose previews or request status reads; it cannot confirm or send. Model errors in intent parsing, multiple tool calls, missing targets, ambiguous names, negation and bulk sends clarify rather than guessing. Bare “yes”, “confirm” and “send it” are not authorization. The ledger, not model prose, supplies payment status; model-provided status/transaction fields are ignored.

**Wired reminder tones:** chat parses `friendly`, `firm` or `empathetic` (default: friendly). The async `prepareReminderConfirmation` helper calls `draftReminder` through the configured OpenAI-compatible provider when `LLM_API_KEY` is present and `PAYLINK_DEMO_MODE` is not forced on. The remind endpoint/button defaults to friendly. Missing keys, forced demo mode, provider errors, empty responses, risky payment/sending claims, threats, fees, or model-provided amounts/links use deterministic tone-specific wording. Conservative validation is defense-in-depth, not a guarantee of arbitrary model prose quality; merchants must review every draft. Paid/draft/cancelled/refunded/payment-pending invoices refuse before AI. Send previews do not load or call AI. Email/WhatsApp pastes still use deterministic parsers; `extractInbound` remains an isolated optional helper.

**Exact reminder shape:** `preview.message` stores the reminder body, a newline, then authoritative `number · amount USD · due YYYY-MM-DD · pay URL`. The merchant UI labels it as a preview; there is no `Draft — not sent` prefix in the stored payer note. Confirmation never regenerates text: PayPal `remind(..., note)` receives that exact stored message after payment/snapshot rechecks. Identical unexpired previews reuse the stored draft; changing the requested tone replaces and invalidates the older preview. Invoice changes while AI is pending refuse the result.

`summary` / `summarize receivables` is a separate **read-only** path: after normal sandbox status polling it invokes `receivablesSummary`. Authoritative counts, receivable totals (net of recorded partial payments), overdue amounts and draft counts are computed from the ledger, excluding paid/sample/cancelled/refunded rows. An optional model call adds collections priorities only, with deterministic advice on no key or model failure. It has no send/confirmation tools and cannot mutate payment status or create a send confirmation. This read-only model recommendation is not part of the strict no-provider/no-mail send-preview path.

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
| `RESEND_API_KEY` / `RESEND_FROM` | Not used by this confirmation workflow. Demo mail is local-only; sandbox reminders use PayPal alone. |
| `DATA_DIR` | JSON store directory. Docker uses `/data`. |

PayPal demo mode follows the credentials (unless `PAYPAL_MODE=demo` explicitly overrides), not `PAYLINK_DEMO_MODE`. That flag chooses the agent parser/model and forces AI helper fallbacks. With credentials set, **confirmed dispatches**, status reads and webhook verification use `https://api-m.sandbox.paypal.com`; previews never contact PayPal. The payer page continues to PayPal's hosted invoice (`recipient_view_url`, allowlisted to `www.sandbox.paypal.com`). "I've paid" syncs with `GET /v2/invoicing/invoices/{id}`; it cannot simulate a sandbox payment. Sandbox webhooks require `PAYPAL_WEBHOOK_ID` and signature verification returning `SUCCESS`. Paid status alone is insufficient for a receipt: both a PayPal transaction id and recorded paid amount are required; short payments stay underpaid. No transaction id or missing amount is invented.

Fresh sandbox stores contain no seeded invoices or receipts. Demo samples are explicitly labelled and excluded from monetary totals; historical demo rows are omitted from sandbox dashboard/API/receivables views without deleting the stored history. The landing-page example ledger is labelled Sample data. Outstanding balances subtract recorded partial payments and omit cancelled/refunded invoices. Health reports `paypal: "sandbox"` when sandbox credentials select the real rail.

### Sandbox setup (operator-run only)

1. In the PayPal developer sandbox, use a REST app associated with a sandbox **business** merchant, and a separate sandbox **personal** buyer. Put the REST app id/secret in the two `PAYPAL_CLIENT_*` variables and the associated business email in `PAYPAL_MERCHANT_EMAIL`. Never use live credentials or real customer addresses.
2. Keep `PAYPAL_ENVIRONMENT=sandbox`. Set `APP_URL=http://localhost:3030` for local use. For AI, export `LLM_API_KEY` and optionally `LLM_BASE_URL`/`LLM_MODEL`; leave `PAYLINK_DEMO_MODE` unset or set it to `0`.
3. Start the app. Creating an invoice, including legacy `asDraft:false` callers, now saves a local draft only. Review a preview, then use the separate **Confirm invoice send** button only when explicitly authorized to send to your sandbox buyer.
4. If authorized to exercise the complete sandbox flow, send to the sandbox buyer, open the payer link and finish on PayPal. The app never accepts card numbers, performs a capture, or treats a browser redirect as proof of payment. Card availability is controlled by PayPal, not guaranteed by the method selector.
5. Keep the merchant dashboard or payer page open: sandbox polling queries the remote invoice, updates its PayPal status and writes one receipt when paid. Manual sync is also available. Optional verified webhooks can accelerate updates; no webhook configuration is needed for polling.

OAuth is cached in memory with a 15-second expiry margin, concurrent refresh coalescing, and one refresh/retry on HTTP 401. Calls have timeouts and reject redirects. Draft/send requests carry stable provider request ids. A created remote reference is recorded before delivery. An ambiguous timeout **blocks automatic retry and replacement**; inspect PayPal and local state before operator recovery. Errors never silently switch to demo mode.

### Persistent confirmation contract

- `POST /api/invoices/{id}/send` and `/remind` **prepare previews only**. Chat/inbox send previews use the synchronous local builder; chat/route reminder previews use the async AI/fallback builder. Identical draft/preview retries reuse the existing local invoice and pending confirmation.
- Previews include action, invoice number/id, recipient, exact USD amount, description, due date, exact message, sandbox/demo mode and a 15-minute expiry. No model output can supply a confirmation token to a tool.
- A separate JSON `POST /api/confirmations/{id}` must specify `decision: "confirm"`, the exact `invoiceId`, and `action`. Cancellation uses `decision: "cancel"`. The UI has separately labelled confirm/cancel buttons; chat text never calls this route.
- Confirmation is bound to the stored invoice/payment/merchant snapshot, action, origin and mode. Changed fields, partial-payment state, cancelled previews and expired tokens cannot dispatch. Same-origin/JSON checks reject cross-site confirmation posts. This is not a replacement for merchant authentication.
- Before the first await, the token becomes `executing` and is synchronously persisted with file/directory fsync and atomic rename. Concurrent confirmations cannot reuse it. Success becomes `done`; repeats return “already completed” without dispatch. A dispatch failure becomes `uncertain`; an interrupted process leaves `executing`. Both block new previews/replacements for that invoice, including after restart. No automatic recovery/retry occurs.
- Sandbox reminder confirmation rechecks PayPal status, then rechecks the exact local snapshot before sending. Paid/draft/cancelled/refunded/payment-pending invoices and unavailable status reads are refused. Invoice creation revalidates after remote draft creation and before delivery. A local paid state cannot be overwritten by send completion.
- Sandbox reminder delivery uses PayPal only, not a second SMTP/Resend message. Demo reminders only update the local rail/mail log, even with mail credentials present. Bulk chase is disabled.
- Invoice pages recover pending/blocked confirmation records after reload. Review displays the exact stored message, including AI/fallback reminder prose and authoritative facts; dispatch passes it unchanged.

**Storage/operational limits:** run exactly one Node process against one persistent POSIX data directory; this is not a multi-process/distributed transaction system. Keep and back up the store, never delete it to clear a blocked action. A filesystem write failure prevents initial dispatch; a crash or persistence failure after provider acceptance remains an operator-review case. PayPal can change between the final status read and the request; already in-flight requests cannot be recalled. Legacy remote sandbox drafts cannot be sent by this workflow because their remote contents cannot be matched to a confirmed local creation; operator reconciliation is required. No automated override, re-send or refund endpoint is provided. Pending preview expiry does not prove that an earlier dispatch failed. Confirmations are not multi-tenant identities; keep the prototype in a trusted, access-controlled environment.

### Operator quality checklist — steps only, not executed here

Use only authorized sandbox accounts and a separate reviewer environment. Keep real recipients, production keys and live funds out of it. Do not run the smoke script or any outgoing action merely to check this implementation.

**Offline review first**
1. Run the mocked tests, typecheck and build listed above on the reviewer box. Test setup clears credential variables and blocks unmocked fetch. Inspect the preview/confirmation UI at 390px and desktop, including long recipients/messages, cancellation and expiry.
2. With all provider/model credentials absent, make a local draft. Confirm that the record has no PayPal reference and no mail record until the separate confirmation. Reload its invoice page and verify the same pending preview is recoverable.
3. Verify bare “yes”, “send it”, “remind”, “chase all unpaid”, negated requests, multiple matches and multiple requested actions clarify without sending. Test duplicate clicks and same-token retries; there must be one dispatch, not two.

**Real-model quality review (requires separate operator authorization for model calls)**
1. Configure the approved model only on the reviewer box. Leave PayPal in demo mode. Ask a free-form invoice question using a sandbox-only/example recipient. Compare extracted client, email, amount, description and relative date against the user's words; the result must be a local draft, never a sent/paid claim.
2. Try missing amounts/recipients, two possible clients, pronouns referring to history, conflicting dates, a pasted prompt injection, and requests to fabricate paid status/transaction ids. Expect clarification or a reviewable local draft, no dispatch and no payment-status mutation. Record failures for parser/prompt tuning; do not confirm wrong previews.
3. Check that invoice send previews and inbox requests make no model/PayPal/mail requests. Reminder previews may call only the model; verify friendly/firm/empathetic variants, fallback on errors/unsafe prose, and no dispatch before confirmation. Inspect the exact confirmation message against the structured fields. Report generated claims that contradict ledger state as quality failures; do not confirm them.

**Sandbox buyer → polling → receipt (requires separate authorization for actual sandbox sends/payment)**
1. On the reviewer box configure an existing sandbox business REST app and a separate personal sandbox buyer. Keep `PAYPAL_ENVIRONMENT=sandbox`, sandbox merchant email and the approved local `APP_URL`; never register accounts or submit/deploy anything as part of this task.
2. Prepare one small USD invoice to that buyer. Before confirming, verify no remote invoice/send/email exists from the preview. Review the exact recipient, amount, due date and message; explicitly confirm once. Check a single sandbox remote reference and hosted sandbox payer link.
3. Open the payer page as the sandbox buyer and complete payment on PayPal only if authorized. A browser return or “I've paid” click must not itself mark paid.
4. Keep dashboard/payer polling open or use manual Sync. Verify PayPal reports payment, the ledger transitions to paid, and exactly one receipt appears. Repeat polling/sync and check the same receipt id remains; no model response creates a receipt.
5. Before payment, optionally prepare—but do not confirm—a reminder. After payment attempt confirmation of that old preview only in an authorized test: it must refuse, never remind. Also verify draft reminders are refused. If status is unavailable, stop rather than retry a send.
6. For an ambiguous response, stop, inspect PayPal's invoice/delivery state and the persisted confirmation/remote reference. Do not generate a replacement or clear `executing`/`uncertain` automatically; recovery requires a separately reviewed reconciliation plan.

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
2. The app saves a local draft and structured preview. Only a separate explicit confirmation permits remote draft creation (`POST /v2/invoicing/invoices`) and send (`POST /v2/invoicing/invoices/{id}/send`).
3. The payer opens `/pay/{id}`: summary, payment method, then pay. Demo mode records a simulated capture. Sandbox mode opens the hosted PayPal invoice.
4. A paid webhook, a remote poll/manual sync, or the demo capture marks the invoice paid and writes a receipt at `/receipts/{id}`. Dashboard polling checks at most five due rows per request, with a 15-second per-invoice cooldown; payer polling checks every 15 seconds. Polling is browser-driven, not a background scheduler.
5. Reminder requests prepare local previews. A separate confirmation rechecks state, then calls PayPal's remind endpoint (sandbox) or the local demo log. Paid and draft invoices are refused. No additional external email is sent.

The core `CreatePaymentInput.currency` field is typed `"USDC"` because that was the first rail. This provider settles the decimal amount in USD and reports `asset: "USD"`. That adaptation lives in `lib/provider.ts`.

## Work since 1 October 2026 / verification

Repository history records the shared PayLink core on **4 November** (`ab88cba`), its paid-reminder guard on **4 November** (`d5a5c77`), and the PayPal scaffold on **5 November** (`9de8dc1`), all after 1 October. The shared core is reused, not represented as newly written in this sandbox integration. This app includes sandbox-only host enforcement, OAuth refresh/error handling, draft/send recovery, real status polling and evidence-backed receipts, grounded receivables summaries, AI reminder tone previews with safe fallbacks, and the guarded smoke script. Paste extraction remains deterministic. PayPal-specific work stays inside this app; Keel light-grey/white, near-black `#181C25`, mint `#71FC8F`, and tracking are preserved. Typography uses self-hosted Instrument Sans (SIL OFL 1.1); Degular is not included.

Focused mocked tests cover preview → explicit confirmation → send → paid receipt, all three live AI reminder tones and no-key fallbacks, unsafe/empty/down-model fallback, stored PayPal note equality, ambiguous commands, exact token binding, duplicate/retried confirmation, durable reservations/restart, expiry/cancel/changed recipients, paid/draft reminder refusals, snapshot changes while awaiting AI, payment after preview, missing payment evidence, sandbox seeding/health, and model-fabricated payment fields. Existing client/provider/AI helper/smoke-guard coverage remains. Test setup blocks unmocked `fetch` and clears payment/model/mail credential env names. No test requires credentials or sends external messages.

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
