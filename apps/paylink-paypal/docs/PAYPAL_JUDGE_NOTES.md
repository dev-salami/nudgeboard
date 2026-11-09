# Judge upgrade handoff

- `a466895`: brand constant and collections-first dashboard; selected proposals prepare previews, separate explicit confirmation dispatches each action.
- `b098d97`: populated, labelled Judge demo with isolated in-memory actions and an ungated real/demo books toggle.
- `da61f52`: computed payer-history reasons, tones, escalation and movement-aware small-balance write-off policy.
- `f75e600`: sandbox/demo cancellation, recorded external payments/refunds, confirmation inputs, partial reconciliation and invoice controls.
- `e536b9f`: webhook event ids, app-local status history, activity/receipt evidence, GET provenance and secret-free health readiness.
- `2d2457c`: 60-second judge path, complete PayPal HTTP inventory/tool equivalents, dated app-only history and buyer-login placeholder. Existing MIT licence retained.
- Optional item 5 follow-up: public read-only `paypal-invoice` JSON profile, issued rows only, missing/draft 404s, allowlisted sandbox hosted URLs, links and shape/privacy tests. No payment execution or new PayPal calls.

## Validation and operator follow-ups

Node.js and pnpm are absent from the coding environment. Focused Vitest tests were added; tests, typecheck, build and browser visuals must be checked on the review box. No install, PayPal calls, smoke requests, deployment or push was performed.

Configure webhook verification on the operator's sandbox app. Approve and supply a separate sandbox buyer login privately in the submission form; this task created no buyer account and committed no credentials. Keep real books in the trusted operator environment. Demo data never represents sandbox evidence, and demo actions reset on process restart.

Optional real-sandbox seeding script was deferred. No autonomous toolkit/MCP sidecar was added: direct sandbox APIs remain behind the confirmation gate. Payment/refund recording documents already completed external transactions and does not move funds. Missing or uncertain provider responses require manual reconciliation, never automatic retry.
