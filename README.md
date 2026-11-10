# Nudgeboard

This extract keeps the internal package path `apps/paylink-paypal` and the shared workspace package `packages/paylink-core`. Run commands from the repository root.

## 60-second judge path

1. Open **https://paypal.181labs.build/dashboard** (or http://localhost:3030/dashboard locally). The merchant home is the **collections queue**, not chat. When no real sandbox invoices exist it opens populated, labelled **Judge demo data — not PayPal sandbox invoices**. No access code is required for that view.
2. Read a proposed reminder, its computed payer-history reason, recommended tone, and remaining balance. For example, Harbour's late-payment reason comes from three prior paid invoices, not a sentence attached to the open invoice.
3. In **View judge demo**, select/deselect proposals and click **Approve selected**. This only prepares previews. Read each exact message or cancellation note; then **Confirm and send N actions** separately to exercise simulated actions. Per-item results remain visible. In sandbox books, do not confirm outgoing actions without operator approval.
4. Chat remains secondary at `/chat`. Typing **“yes”**, **“confirm”** or **“send it”** is refused as authorization. Chat cannot bulk-send reminders.
5. Optional: paste a fictional email/WhatsApp request into `/inbox`. It creates a **local draft only**, not a mailbox connection or an outgoing invoice.
6. Optional, sandbox payment only: to pay a real sandbox invoice as the judge buyer, use the **Judge sandbox buyer login** section below. That login is SANDBOX ONLY (no real money) and is not needed for the demo queue.

The ungated **View judge demo / View sandbox books** control separates the datasets. Judge fixtures and confirmations are in-memory and reset on process restart; they never become sandbox payment evidence. These upgrades are live at https://paypal.181labs.build.

The displayed product name is defined once in [`lib/brand.ts`](./lib/brand.ts); this heading mirrors `PRODUCT_NAME`.

AI invoicing and collections agent for freelancers. It reads a job request and saves a **local USD draft and structured preview**. Only a separate explicit confirmation can create/send a sandbox invoice or send a reminder. The payer pays on a PayPal-hosted invoice. In demo mode checkout is simulated on our pay page.

This repository is a private MIT extract of the Nudgeboard PayPal app and the shared `packages/paylink-core` workspace package. It is aimed at Best Agentic Commerce and Best PayPal + AI. PayPal is the rail for invoice creation, sending, reminding, cancellation, recorded external payments/refunds, status reads and webhook verification. `packages/paylink-core` is shared with a Solana sibling; this app is the **PayPal slice**. PayPal-specific types and changes stay in this app.

The PayPal AI Hackathon opened on 1 October 2026. The shared invoicing core in `packages/paylink-core` was written in this repo during that window for the Solana sibling product named PayLink: invoice domain, agent tool names, date parsing, money, and the reminder guard. This app is **Nudgeboard**, the PayPal slice, not a resubmission under the sibling's product name. It implements `PaymentProvider` inside the app, adds the sandbox client, the collections queue, the inbox adapters, and the payer flow. PayPal-specific types stay here. They are not added to `paylink-core`.

The extract history was produced with `git filter-repo` so original author dates are preserved; commit hashes differ from the source monorepo. No Devpost registration is part of this tree.

Application code is licensed under MIT. See [LICENSE](./LICENSE). No API keys belong in git. The UI self-hosts [Instrument Sans](./app/fonts/README.md) under the SIL Open Font License 1.1.

## Every PayPal API call

The HTTP API host is exclusively `https://api-m.sandbox.paypal.com`. Demo transport and Judge demo actions make no PayPal requests. `{id}` below is the encoded PayPal invoice id, not another merchant's local invoice id.

| Method | Path | Used for | Equivalent Agent Toolkit / MCP tool |
| --- | --- | --- | --- |
| POST | `/v1/oauth2/token` | Cached OAuth authentication | Transport authentication; no agent action |
| POST | `/v2/invoicing/invoices` | Create a remote draft after confirmation | `create_invoice` |
| POST | `/v2/invoicing/invoices/{id}/send` | Send the confirmed invoice | `send_invoice` |
| GET | `/v2/invoicing/invoices/{id}` | Sync/poll, hosted link, payment/refund evidence, pre-dispatch recheck | `get_invoice` |
| POST | `/v2/invoicing/invoices/{id}/remind` | Confirmed reminder; escalation uses this same API with firm tone | `send_invoice_reminder` |
| POST | `/v2/invoicing/invoices/{id}/cancel` | Confirmed write-off (**cancel in PayPal**) | `cancel_sent_invoice` |
| POST | `/v2/invoicing/invoices/{id}/payments` | Confirmed record of an already completed external/partial payment | `record_payment_for_invoice` |
| POST | `/v2/invoicing/invoices/{id}/refunds` | Confirmed record of an already completed external refund | `record_refund_for_invoice` |
| POST | `/v1/notifications/verify-webhook-signature` | Verify a received event before applying it | Signature verification; no agent money action |
| GET | `/v2/invoicing/invoices?page=1&page_size=5&total_required=false` | Operator smoke script only; read-only permission check | `list_invoices` |

Recorded payments/refunds **do not transfer or return money**. The app requires a returned PayPal payment/refund id and stores it; missing evidence blocks automatic retry and requires reconciliation. GET supplies cumulative paid/refunded amounts; unpaid remainders stay underpaid. No capture, order, payout, buyer-account creation or production payment API is called.

### PayPal Agent Toolkit fit

We retain the sandbox-only HTTP client rather than adding a runtime `@paypal/agent-toolkit` agent or `@paypal/mcp` sidecar that could bypass approval. We call the same Invoicing v2 and webhook-verification endpoints documented by those tools, behind our explicit confirmation gate. Equivalent tools include `send_invoice_reminder`, `cancel_sent_invoice`, `record_payment_for_invoice`, and `record_refund_for_invoice`. Recorded payments and refunds document external transactions; they do not execute transfers. No toolkit dependency or autonomous payment permission is installed.

## Collections policy and evidence

- Rank **every open invoice** by days overdue descending, then remaining balance descending. A stable invoice-id tie-break makes equal rankings deterministic.
- One proposal per invoice: `remind`, `escalate` (firm PayPal reminder), or **Write off (cancel in PayPal)**. Policy thresholds live in `lib/collections-queue.ts`; payer history in `lib/payer-history.ts` uses exact normalized payer email and the latest three paid records in the active dataset.
- Newly overdue first-time payers get friendly reminders. Prior late payments/repeated reminders firm the tone. Partial payments mention the received amount and remaining balance; an early partial gets empathetic wording. Escalate at 14 overdue days if previously reminded, at least $1,000 remains, or all three prior payments were late.
- Propose write-off only when the remaining balance is at most $25, the invoice is at least 45 days overdue, and there has been no payment movement for at least 45 days. These rules are proposals, never autonomous cancellation.
- Batch approval prepares confirmations only. The second control submits the listed pending confirmations individually as same-origin JSON. Each binds invoice, action, origin, mode, exact message/input and snapshot; each reports its own outcome. Done confirmations do not repeat, and uncertain actions require operator review.
- The queue, books tiles, ledger, landing books section and 24-day chart use the selected dataset. Demo rows/totals remain labelled and excluded from real sandbox totals, sync and webhooks. Fictional `.example` clients include late history, a first chase, large/tiny overdue balances, partial, cancelled and refunded invoices.
- Webhook-driven changes store the PayPal event id in app-local status history and activity details. Queue/ledger/invoice pages show evidence; webhook-driven receipts show the event id. Sync-driven changes say **PayPal invoice GET (no webhook id)**. The last received webhook id is retained separately, never invented for a GET. Demo events are labelled demo.
- `GET /api/health` returns PayPal mode plus `webhook: "unconfigured" | "ready"`, never the configured webhook id. In sandbox, unset configuration, missing transmission headers or failed signature verification prevents application. Event ids still deduplicate.

Keel styling remains mint `#71FC8F`, near-black `#181C25`, and self-hosted **Instrument Sans** only. The app's [MIT licence](./LICENSE) is unchanged; font licensing remains [SIL OFL 1.1](./app/fonts/OFL.txt).

## Judge sandbox buyer login

Payment is completed on PayPal's sandbox, at https://www.sandbox.paypal.com, not inside this app. This login is **SANDBOX ONLY** — it cannot move real money.

**Sandbox buyer** (dedicated PayPal **sandbox** personal/buyer account):

- Email: `nudgeboard.judge@personal.example.com`
- Password: `Nudgee7393a1e!Jd`

This is not a live PayPal login, not this app's merchant REST credentials, and not a client secret. Leave all other secrets out of git.

### How to pay a sandbox invoice

These steps are only for a real sandbox invoice in **View sandbox books**. They are not required to inspect the labelled Judge demo queue, and Judge demo actions do not charge this buyer.

1. Open a **sent** sandbox invoice and follow its payer page (https://paypal.181labs.build/pay/…, or local http://localhost:3030/pay/…) until it sends you to the hosted PayPal invoice.
2. On https://www.sandbox.paypal.com, sign in with the sandbox buyer email and password above. Do not use a live PayPal account or the merchant business login.
3. Complete the sandbox checkout for the invoice amount. A return to this app or an “I've paid” click is not itself proof of payment.
4. The app marks the invoice paid only after a verified PayPal webhook or a status GET that includes both a PayPal transaction id and a paid amount. The receipt will show the webhook event id when the paid update arrived by webhook.

No login is required to inspect the labelled Judge demo queue.
## Read-only invoice for a buyer's agent

`GET /api/invoices/{localInvoiceId}/agent` returns JSON with `profile: "paypal-invoice"`, `version: 1`, invoice `number`, `amount`, `currency`, `dueDate`, local `status`, `paypalStatus`, `remainingBalance`, `source`, and `payment: { payPath, hostedPaypalUrl?, execution }`. It is linked from invoice and payer pages. `?books=demo` reads only the labelled, isolated Judge demo dataset.

The endpoint is public for issued/non-draft invoices and returns the same 404 for missing or draft rows. It allowlists output fields: no client email/name, merchant-only activity, confirmation tokens, transaction history or other invoices. Hosted URLs must be HTTPS on `www.sandbox.paypal.com`; otherwise they are omitted. Reads do not sync, contact PayPal or execute any payment. The local pay path is informational for demo fixtures; real sandbox payment continues to PayPal. This adds no PayPal API calls.

## Run

From the repository root:

```bash
pnpm install
pnpm --filter paylink-paypal dev
```

Open http://localhost:3030.

Demo mode is the default. Leave `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` empty. The agent still creates an invoice, the pay page still completes a simulated PayPal or card checkout, and the dashboard updates. The webhook route accepts a well-formed `INVOICING.INVOICE.*` event without a live signature.

Try this in the agent:

```text
Invoice Northwind accounts@northwind.example 480 USD for the spring logo, due Friday
```

Review the structured preview, then click **Confirm invoice send** separately. Only then open the pay link, choose PayPal or card, and complete the demo payment. Inbox on `/inbox` accepts email-style and WhatsApp-style pastes as local drafts only, using the deterministic parser even when a model key exists. These are paste adapters, not mailbox or WhatsApp connections.

AI examples:

```text
Invoice Northwind accounts@northwind.example 480 USD for the spring logo, due Friday
Draft a friendly overdue reminder for Northwind
Draft a firm reminder for PP-2026-1041
Draft an empathetic reminder for Northwind
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

Fresh sandbox stores contain no seeded invoices or receipts. The UI instead defaults to the isolated, populated Judge demo when no real rows exist; with real invoices it defaults to those books. Historical samples remain excluded from real sandbox API/receivables/totals without deleting history. Inbox paste fields start empty; agent prompt chips are not real invoices. Outstanding balances subtract recorded partial payments and omit cancelled/refunded rows. Collected totals account for recorded refunds. Health reports `paypal: "sandbox"` when sandbox credentials select that rail, plus webhook readiness only.

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
- Sandbox reminder delivery uses PayPal only, not a second SMTP/Resend message. Demo reminders only update the local rail/mail log, even with mail credentials present. Chat bulk chase remains disabled; the queue prepares multiple previews but dispatches only separately confirmed tokens.
- Invoice pages recover pending/blocked confirmation records after reload. Review displays the exact stored message, including AI/fallback reminder prose and authoritative facts; dispatch passes it unchanged.

**Storage/operational limits:** run exactly one Node process against one persistent POSIX data directory; this is not a multi-process/distributed transaction system. Keep and back up the store, never delete it to clear a blocked action. A filesystem write failure prevents initial dispatch; a crash or persistence failure after provider acceptance remains an operator-review case. PayPal can change between the final status read and the request; already in-flight requests cannot be recalled. Legacy remote sandbox drafts cannot be sent by this workflow because their remote contents cannot be matched to a confirmed local creation; operator reconciliation is required. There is no automated override or re-send recovery. Refund recording is explicitly confirmed and does not execute a refund transfer. Pending preview expiry does not prove that an earlier dispatch failed. Confirmations are not multi-tenant identities; keep real sandbox books in a trusted, access-controlled operator environment. The ungated Judge demo has an isolated ephemeral store, not merchant payment permissions.

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

1. The merchant talks to the agent, or pastes a request. The shared invoicing core's tool names are used: `create_invoice`, `check_status`, `list_unpaid`, `send_reminder`.
2. The app saves a local draft and structured preview. Only a separate explicit confirmation permits remote draft creation (`POST /v2/invoicing/invoices`) and send (`POST /v2/invoicing/invoices/{id}/send`).
3. The payer opens `/pay/{id}`: summary, payment method, then pay. Demo mode records a simulated capture. Sandbox mode opens the hosted PayPal invoice.
4. A paid webhook, a remote poll/manual sync, or the demo capture marks the invoice paid and writes a receipt at `/receipts/{id}`. Dashboard polling checks at most five due rows per request, with a 15-second per-invoice cooldown; payer polling checks every 15 seconds. Polling is browser-driven, not a background scheduler.
5. Reminder requests prepare local previews. A separate confirmation rechecks state, then calls PayPal's remind endpoint (sandbox) or the local demo log. Paid and draft invoices are refused. No additional external email is sent.

The core `CreatePaymentInput.currency` field is typed `"USDC"` because that was the first rail. This provider settles the decimal amount in USD and reports `asset: "USD"`. That adaptation lives in `lib/provider.ts`.

## What's new since 1 October 2026

These dates are the original author timestamps (Africa/Lagos, WAT) preserved through `git filter-repo`. Short hashes are from this extract's rewritten history and therefore differ from the source monorepo. `packages/paylink-core` is shared with a Solana sibling product named PayLink; this is Nudgeboard's PayPal-app history, not a claim that the shared core was rewritten here.

Historical commit subjects below predate the Nudgeboard name and are preserved verbatim.

| Date | Commit | PayPal-app subject |
| --- | --- | --- |
| 2026-11-05 | `0bc1872` | Add PayLink PayPal, an invoicing and collections agent. |
| 2026-11-07 | `3662af6` | Implement sandbox-only PayPal lifecycle and AI collections with guarded smoke checks |
| 2026-11-07 | `a980d74` | Fix colon-containing invoice commands routing as WhatsApp pastes |
| 2026-11-07 | `7aa9a73` | Require durable explicit confirmation for PayPal invoice and reminder sends |
| 2026-11-07 | `a4941fa` | Restore grounded receivables summaries and cover HTTP confirmation safety |
| 2026-11-09 | `e1e5c9f` | Wire AI reminder previews and harden sandbox payment evidence |
| 2026-11-09 | `5e9f27b` | Review: self-host Instrument Sans (SIL OFL 1.1) and fix reminderTone types |
| 2026-11-09 | `b7faed7` | Remove fabricated PayPal landing ledger and client examples |
| 2026-11-09 | `e356f40` | Serve PayLink PayPal on paypal.181labs.build, keep the sslip alias |
| 2026-11-09 | `76036d9` | feat(paypal): lead with confirmed collections queue and shared brand |
| 2026-11-09 | `5f08c05` | feat(paypal): populate isolated labelled judge demo books |
| 2026-11-09 | `c57ef5e` | feat(paypal): compute collection reasons from payer history |
| 2026-11-09 | `2d8cbfc` | feat(paypal): confirm cancellation and recorded payments and refunds |
| 2026-11-09 | `7360011` | feat(paypal): surface webhook status evidence and verification readiness |
| 2026-11-09 | `da9bf2c` | docs(paypal): document judge path and complete sandbox API evidence |
| 2026-11-09 | `15d1b59` | feat(paypal): expose read-only public invoice profile for buyer agents |
| 2026-11-09 | `161c52e` | Review: keep judge-demo mutations out of the merchant store |
| 2026-11-09 | `a9f68c8` | docs(paypal): note that the judge upgrades are already live |
| 2026-11-10 | `d69914d` | feat(paypal): rename product to Nudgeboard and clarify judge buyer placeholder |
| 2026-11-10 | `03302fa` | docs(paypal): add dedicated sandbox judge buyer login to the README |

This documentation upgrade is committed separately as `docs(paypal): document judge path and complete sandbox API evidence`; its date and hash are in Git (a commit cannot embed its own final hash).

The optional read-only agent-invoice follow-up is committed separately as `feat(paypal): expose read-only public invoice profile for buyer agents`.

Focused mocked tests cover preview → explicit confirmation → send → paid receipt, all three live AI reminder tones and no-key fallbacks, unsafe/empty/down-model fallback, stored PayPal note equality, ambiguous commands, exact token binding, duplicate/retried confirmation, durable reservations/restart, expiry/cancel/changed recipients, paid/draft reminder refusals, snapshot changes while awaiting AI, payment after preview, missing payment evidence, sandbox seeding/health, and model-fabricated payment fields. Existing client/provider/AI helper/smoke-guard coverage remains. Test setup blocks unmocked `fetch` and clears payment/model/mail credential env names. No test requires credentials or sends external messages.

**Handoff:** tests/typecheck/build were not executable in the coding container: Node.js and pnpm are absent. No runtime was installed. Run the three commands in the Run section on the reviewer box. New focused tests cover queue ranking/approval, history reasons, fixture separation, cancel/payment/refund paths, refusal/snapshot rules, webhook ids/deduplication/signatures and health redaction. Real PayPal permissions, sandbox delivery/payment, model quality and browser visuals remain unverified; mocks cannot establish those. Configure the webhook id and separately approve/provide a sandbox buyer login. Existing paid receipts remain historical payment evidence; later refund status and recorded refund amount are shown separately, not represented as a new paid receipt. Optional real-sandbox seeding automation was deferred; no PayPal requests, deployments or smoke runs were made.

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
