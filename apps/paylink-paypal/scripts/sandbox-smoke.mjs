import { pathToFileURL } from "node:url";

const BASE = "https://api-m.sandbox.paypal.com";

export function parseFlags(args) {
  const flags = {};
  const switches = new Set(["--create-draft", "--send", "--confirm-sandbox-send", "--help"]);
  const values = new Set(["--recipient-email", "--merchant-email", "--amount"]);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (switches.has(flag)) flags[flag] = true;
    else if (values.has(flag) && args[i + 1] && !args[i + 1].startsWith("--")) flags[flag] = args[++i];
    else throw new Error("Unknown flag or missing value. Use --help.");
  }
  if (flags["--send"] && (!flags["--create-draft"] || !flags["--confirm-sandbox-send"])) {
    throw new Error("Sending requires --create-draft --send --confirm-sandbox-send.");
  }
  if (flags["--confirm-sandbox-send"] && !flags["--send"]) throw new Error("Confirmation requires --send.");
  if (flags["--create-draft"]) {
    for (const flag of ["--recipient-email", "--merchant-email"]) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(flags[flag] || ""))) throw new Error("Draft creation requires valid --recipient-email and --merchant-email sandbox addresses.");
    }
    if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(String(flags["--amount"] || "1.00")) || Number(flags["--amount"] || "1.00") <= 0) throw new Error("Amount must be a positive USD decimal.");
  }
  return flags;
}

/** Injected dependencies let tests exercise guards without credentials or network. */
export async function runSmoke(args, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  // Validate all mutation flags before authentication or any network access.
  const flags = parseFlags(args);
  if (flags["--help"]) {
    log("Default: OAuth + read-only listing of this sandbox merchant's invoices. No invoice is created or sent.\nOptional: --create-draft --recipient-email <sandbox buyer> --merchant-email <sandbox business> [--amount 1.00]\nSending additionally requires BOTH --send --confirm-sandbox-send. No payment or capture action exists.");
    return;
  }
  if (env.PAYPAL_ENVIRONMENT && env.PAYPAL_ENVIRONMENT !== "sandbox") throw new Error("Only sandbox is supported.");
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error("Export sandbox PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first. Values are never printed.");
  const oauth = await fetchImpl(`${BASE}/v1/oauth2/token`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!oauth.ok) throw new Error(`Sandbox OAuth failed (HTTP ${oauth.status}).`);
  const token = (await oauth.json()).access_token;
  if (typeof token !== "string" || !token) throw new Error("Sandbox OAuth returned no access token.");
  log("Sandbox OAuth: OK (token withheld).");
  async function call(path, method = "GET", body, requestId) {
    const response = await fetchImpl(`${BASE}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Sandbox API failed (HTTP ${response.status}); response body withheld.`);
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
  // PayPal REST client credentials do not expose a general account-list API.
  // Listing invoices is the read-only, account-scoped Invoicing permission check.
  const listing = await call("/v2/invoicing/invoices?page=1&page_size=5&total_required=false");
  log(`Sandbox merchant invoice listing: OK (${Array.isArray(listing.items) ? listing.items.length : 0} rows, contents withheld).`);
  if (!flags["--create-draft"]) {
    log("Read-only check complete. No invoice mutations requested.");
    return;
  }
  const stamp = new Date();
  const due = new Date(stamp.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const requestId = crypto.randomUUID();
  const draft = await call("/v2/invoicing/invoices", "POST", {
    detail: { invoice_number: `SMOKE-${stamp.getTime()}`, currency_code: "USD", invoice_date: stamp.toISOString().slice(0, 10), payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: due }, note: "Explicit sandbox smoke test. Not a real invoice." },
    invoicer: { email_address: flags["--merchant-email"] },
    primary_recipients: [{ billing_info: { email_address: flags["--recipient-email"] } }],
    items: [{ name: "Sandbox smoke test", quantity: "1", unit_amount: { currency_code: "USD", value: Number(flags["--amount"] || "1.00").toFixed(2) } }],
  }, requestId);
  const href = typeof draft.href === "string" ? draft.href : draft.links?.find((link) => link.rel === "self")?.href;
  const id = draft.id || (typeof href === "string" ? href.match(/\/invoices\/([^/?#]+)/)?.[1] : undefined);
  if (typeof id !== "string" || !id.startsWith("INV2-")) throw new Error("Draft response has no valid sandbox invoice id. Inspect the sandbox dashboard; do not blindly retry.");
  log("Sandbox draft created (identifier and recipient withheld). It is NOT sent.");
  if (!flags["--send"]) return;
  await call(`/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, "POST", { send_to_recipient: true, send_to_invoicer: false }, crypto.randomUUID());
  log("Sandbox invoice sent following explicit command-line confirmation. No payment was attempted.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke(process.argv.slice(2)).catch(() => {
    // Do not print raw network/provider errors: they can include credentials or PII.
    console.error("Sandbox smoke check failed. Check required env names, flags (--help), and sandbox permissions. No response bodies or secrets are logged. If creation was requested, inspect the sandbox dashboard before retrying.");
    process.exitCode = 1;
  });
}
